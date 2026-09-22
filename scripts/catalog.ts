import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { baselineCatalog } from "../lib/catalog/baseline";
import { parseCatalog } from "../lib/catalog/schema";
import { catalogDiff } from "../lib/catalog/diff";
import { stageCatalog } from "../lib/catalog/service";
import { CatalogError, type CatalogSnapshot } from "../lib/catalog/types";

export function parseImportEnvelope(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("snapshot" in value) ||
    !("baseRevisionId" in value) ||
    (value.baseRevisionId !== null && typeof value.baseRevisionId !== "string")
  )
    throw new CatalogError(
      "Файл импорта должен содержать snapshot и baseRevisionId из data:export",
    );
  return {
    snapshot: parseCatalog(value.snapshot),
    baseRevisionId: value.baseRevisionId,
  };
}

export async function runCatalogImport(args: string[]) {
  const option = (key: string) =>
    args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  const inputFile = option("input");
  const university = option("university");
  const envelope = inputFile
    ? parseImportEnvelope(JSON.parse(await readFile(inputFile, "utf8")))
    : null;
  const candidate = envelope
    ? envelope.snapshot
    : parseCatalog(baselineCatalog());
  if (args.includes("--dry-run")) {
    const selected = university
      ? candidate.programs.filter((row) => row.universitySlug === university)
      : candidate.programs;
    if (
      university &&
      !candidate.universities.some((row) => row.slug === university)
    )
      throw new CatalogError("Неизвестный вуз");
    console.log(
      `DRY RUN: ${university ? 1 : candidate.universities.length} вузов и ${selected.length} программ; схема и источники проверены, БД не менялась.`,
    );
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new CatalogError(
      "Для очереди проверки нужен DATABASE_URL. Используйте --dry-run для проверки без БД.",
    );
  const db = new PrismaClient();
  try {
    const actorEmail = option("actor");
    const actor = actorEmail
      ? await db.user.findUnique({
          where: { email: actorEmail },
          select: { id: true, role: true },
        })
      : null;
    if (!actor)
      throw new CatalogError("Укажите --actor=email существующего редактора");
    const head = await db.catalogHead.findUniqueOrThrow({
      where: { id: "public" },
      include: { revision: true },
    });
    const suppliedBase = envelope ? envelope.baseRevisionId : option("base");
    if (head.revisionId && !suppliedBase)
      throw new CatalogError(
        "Укажите --base=ID публикации или импортируйте файл data:export. Это защищает правки редактора.",
      );
    const base = suppliedBase ?? null;
    if (base !== head.revisionId)
      throw new CatalogError(
        "Основа импорта устарела; экспортируйте текущий каталог заново",
        409,
      );
    let snapshot = candidate;
    if (university) {
      if (!candidate.universities.some((row) => row.slug === university))
        throw new CatalogError("Неизвестный вуз");
      if (!head.revision)
        throw new CatalogError("Сначала импортируйте полный исходный снимок");
      snapshot = mergeUniversity(
        parseCatalog(head.revision.payload),
        candidate,
        university,
      );
    }
    const result = await stageCatalog(db, snapshot, {
      actor,
      expectedRevisionId: base,
      reason:
        option("reason") ?? "Импорт проверяемого снимка официальных источников",
    });
    console.log(
      JSON.stringify({
        ...result,
        message: "Публикация выполняется редактором в /admin/catalog",
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

export function mergeUniversity(
  current: CatalogSnapshot,
  incoming: CatalogSnapshot,
  slug: string,
): CatalogSnapshot {
  const next = structuredClone(current);
  for (const key of [
    "universities",
    "programs",
    "universityFacts",
    "directoryDetails",
    "admissionCampaigns",
  ] as const) {
    const belongs = (row: unknown) => {
      const record = row as { slug?: string; universitySlug?: string };
      return (
        (key === "universities" ? record.slug : record.universitySlug) === slug
      );
    };
    Object.assign(next, {
      [key]: [
        ...current[key].filter((row) => !belongs(row)),
        ...incoming[key].filter(belongs),
      ],
    });
  }
  return parseCatalog(next);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "export") {
    const output = args.find((arg) => arg.startsWith("--output="))?.slice(9);
    if (!output) throw new CatalogError("Укажите --output=путь.json");
    const db = new PrismaClient();
    try {
      const head = await db.catalogHead.findUniqueOrThrow({
        where: { id: "public" },
        include: { revision: true },
      });
      const snapshot = head.revision
        ? parseCatalog(head.revision.payload)
        : baselineCatalog();
      await writeFile(
        output,
        JSON.stringify({ baseRevisionId: head.revisionId, snapshot }, null, 2),
      );
      console.log(`Экспортировано: ${output}`);
    } finally {
      await db.$disconnect();
    }
  } else if (args[0] === "diff") {
    const file = args.find((arg) => arg.startsWith("--input="))?.slice(8);
    if (!file) throw new CatalogError("Укажите --input=путь.json");
    const input = JSON.parse(await readFile(file, "utf8"));
    const db = new PrismaClient();
    try {
      const head = await db.catalogHead.findUniqueOrThrow({
        where: { id: "public" },
        include: { revision: true },
      });
      console.log(
        JSON.stringify(
          catalogDiff(
            head.revision ? parseCatalog(head.revision.payload) : null,
            parseCatalog(input.snapshot),
          ),
          null,
          2,
        ),
      );
    } finally {
      await db.$disconnect();
    }
  } else await runCatalogImport(args);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/catalog.ts"))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Ошибка импорта");
    process.exitCode = 1;
  });
