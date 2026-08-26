import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { DataValueStatus, PrismaClient, SourceType } from "@prisma/client";
import {
  assertAdapterCoverage,
  assertOfficialSource,
} from "../data-sources/core/adapter";
import {
  matchesPersistedMetric,
  matchesPersistedUniversityFact,
} from "../data-sources/core/metric-version";
import { validateUniversityFactProfile } from "../data-sources/core/university-fact-validation";
import {
  getUniversityAdapter,
  universityAdapters,
} from "../data-sources/universities";
import { programs, universities, type Program } from "../lib/data";
import type { SourceKind, SourcedValue } from "../lib/admissions/types";
import {
  universityFactProfiles,
  universitySourcedFields,
} from "../lib/university-facts";

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) ?? "report";
const option = (name: string) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const university = option("university");
const year = Number(option("year") ?? 2026);
const dryRun = args.includes("--dry-run");
const selected = university
  ? universityAdapters.filter((adapter) => adapter.slug === university)
  : universityAdapters;
const cacheRoot = join(process.cwd(), "data-sources", "cache");
const PRIVATE_RESPONSE_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "www-authenticate",
]);

assertAdapterCoverage(
  universityAdapters,
  universities.map(({ slug }) => slug),
);

function safeResponseHeaders(headers: Headers) {
  return Object.fromEntries(
    [...headers].filter(
      ([name]) => !PRIVATE_RESPONSE_HEADERS.has(name.toLowerCase()),
    ),
  );
}

if (university && selected.length === 0)
  throw new Error(`Неизвестный адаптер: ${university}`);

function statusName(value: string): DataValueStatus {
  return value.toUpperCase() as DataValueStatus;
}
function sourceTypeName(value: SourceKind | undefined): SourceType {
  const names: Record<SourceKind, SourceType> = {
    html: "OFFICIAL_HTML",
    pdf: "OFFICIAL_PDF",
    xlsx: "XLSX",
    csv: "CSV",
    docx: "MANUAL",
  };
  return names[value ?? "html"];
}
function official(adapterSlug: string, url: string) {
  const adapter = getUniversityAdapter(adapterSlug);
  if (!adapter) return false;
  try {
    assertOfficialSource(adapter, {
      category: "programs",
      title: "validation",
      year,
      format: "html",
      url,
    });
    return true;
  } catch {
    return false;
  }
}

function sourcedFields(
  program: Program,
): Array<[string, SourcedValue<unknown>]> {
  return [
    ["passing_score_general", program.passingScoreValue],
    ["budget_places", program.budgetPlacesValue],
    ["paid_places", program.paidPlacesValue],
    ["tuition_year", program.tuitionValue],
    ["dvi", program.dviValue],
    ["dvi_max", program.dviMax],
    ["individual_achievements_max", program.individualAchievementsMax],
    ["quota_general", program.quotas.general],
    ["quota_special", program.quotas.special],
    ["quota_separate", program.quotas.separate],
    ["quota_target", program.quotas.target],
    ["hostel", program.hostel],
    ["military_center", program.militaryCenter],
    ...program.examRequirements.map(
      (item) =>
        [`exam_minimum:${item.subjects.join("|")}`, item.minimum] as [
          string,
          SourcedValue<unknown>,
        ],
    ),
    ...program.passingHistory.map(
      (item) =>
        ["passing_score_general", item] as [string, SourcedValue<unknown>],
    ),
    ...program.placesHistory.map(
      (item) => ["budget_places", item] as [string, SourcedValue<unknown>],
    ),
    ...program.tuitionHistory.map(
      (item) => ["tuition_year", item] as [string, SourcedValue<unknown>],
    ),
  ];
}

export function validateProgram(program: Program) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!official(program.universitySlug, program.sourceUrl))
    errors.push("основной URL не относится к официальному домену");
  for (const [key, field] of sourcedFields(program)) {
    if (!official(program.universitySlug, field.sourceUrl))
      errors.push(`${key}: неофициальный URL`);
    if (field.value === null && field.status === "verified")
      errors.push(`${key}: null не может быть verified`);
    if (field.value !== null && field.status === "not_published")
      errors.push(`${key}: опубликовано значение со статусом not_published`);
    if (
      typeof field.value === "number" &&
      key.includes("score") &&
      (field.value < 0 || field.value > 410)
    )
      errors.push(`${key}: балл вне допустимого диапазона`);
    if (
      typeof field.value === "number" &&
      (key.includes("places") || key.includes("quota")) &&
      (!Number.isInteger(field.value) || field.value < 0)
    )
      errors.push(`${key}: места должны быть целым неотрицательным числом`);
    if (
      key === "tuition_year" &&
      typeof field.value === "number" &&
      field.value < 0
    )
      errors.push(`${key}: отрицательная стоимость`);
    if (
      !field.sourceUrl ||
      !field.sourceName ||
      !field.retrievedAt ||
      !field.checkedAt ||
      !field.checkedBy
    )
      errors.push(`${key}: неполные метаданные происхождения`);
  }
  const quotas = Object.values(program.quotas).map((field) => field.value);
  if (
    program.budgetPlaces !== null &&
    quotas.every((value) => value !== null)
  ) {
    const sum = quotas.reduce<number>(
      (total, value) => total + Number(value),
      0,
    );
    if (sum > program.budgetPlaces)
      errors.push(
        `сумма квот ${sum} превышает бюджетные места ${program.budgetPlaces}`,
      );
  }
  if (program.examRequirements.length === 0)
    warnings.push("вступительные испытания ожидают сопоставления");
  if (program.trust.status === "verified" && errors.length)
    errors.push("карточка verified содержит критические ошибки");
  return { errors, warnings };
}

async function robotsDecision(url: string) {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": "PostupaiDataBot/1.0 (+public data audit)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      return {
        allowed: true,
        robotsUrl,
        note: `robots.txt вернул ${response.status}`,
      };
    const text = await response.text();
    let applies = false;
    const disallows: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.split("#")[0].trim();
      const [name, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (name.toLowerCase() === "user-agent")
        applies = value === "*" || value.toLowerCase().includes("postupai");
      if (applies && name.toLowerCase() === "disallow" && value)
        disallows.push(value);
    }
    return {
      allowed: !disallows.some((path) => target.pathname.startsWith(path)),
      robotsUrl,
      note: disallows.length
        ? `проверено правил: ${disallows.length}`
        : "явных запретов нет",
    };
  } catch (error) {
    return {
      allowed: true,
      robotsUrl,
      note: `robots.txt недоступен: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function discover() {
  for (const adapter of selected) {
    for (const source of adapter.sources.filter((item) => item.year === year))
      assertOfficialSource(adapter, source);
    console.log(
      JSON.stringify({
        university: adapter.slug,
        domains: adapter.officialDomains,
        sources: adapter.sources.filter((item) => item.year === year),
      }),
    );
  }
}

async function fetchSources() {
  for (const adapter of selected) {
    for (const source of adapter.sources.filter((item) => item.year === year)) {
      assertOfficialSource(adapter, source);
      const robots = await robotsDecision(source.url);
      if (!robots.allowed) {
        console.warn(`${adapter.slug}: robots.txt запрещает ${source.url}`);
        continue;
      }
      const response = await fetch(source.url, {
        headers: { "user-agent": "PostupaiDataBot/1.0 (+public data audit)" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        console.warn(`${adapter.slug}: ${response.status} ${source.url}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const checksum = createHash("sha256").update(buffer).digest("hex");
      const extension =
        extname(new URL(source.url).pathname) ||
        `.${source.format === "html" ? "html" : source.format}`;
      const directory = join(cacheRoot, adapter.slug);
      await mkdir(directory, { recursive: true });
      const filename = `${source.year}-${source.category}-${checksum.slice(0, 12)}${extension}`;
      const file = join(directory, filename);
      await writeFile(file, buffer);
      await writeFile(
        `${file}.meta.json`,
        JSON.stringify(
          {
            sourceUrl: source.url,
            title: source.title,
            year: source.year,
            university: adapter.slug,
            category: source.category,
            retrievedAt: new Date().toISOString(),
            status: response.status,
            headers: safeResponseHeaders(response.headers),
            checksumSha256: checksum,
            mimeType: response.headers.get("content-type"),
            robots,
          },
          null,
          2,
        ),
      );
      console.log(
        `${adapter.slug}: ${relative(process.cwd(), file)} (${buffer.length} bytes)`,
      );
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
}

async function parseCache() {
  for (const adapter of selected) {
    const directory = join(cacheRoot, adapter.slug);
    let files: string[] = [];
    try {
      files = await readdir(directory);
    } catch {
      console.warn(`${adapter.slug}: кэш пуст`);
      continue;
    }
    for (const file of files.filter((name) => !name.endsWith(".meta.json"))) {
      const path = join(directory, file);
      const content = await readFile(path);
      const source =
        adapter.sources.find((item) => file.includes(item.category)) ??
        adapter.sources.find((item) => extname(file).includes(item.format));
      if (!source) {
        console.warn(`${adapter.slug}: не найдено описание ${file}`);
        continue;
      }
      const parsed = adapter.parse(
        source.format === "html"
          ? content.toString("utf8")
          : content.toString("latin1"),
        source,
      );
      console.log(
        JSON.stringify({
          university: adapter.slug,
          file,
          bytes: (await stat(path)).size,
          ...parsed,
        }),
      );
    }
  }
}

async function validate() {
  let critical = 0;
  for (const profile of universityFactProfiles.filter(
    (item) => !university || item.universitySlug === university,
  )) {
    const result = validateUniversityFactProfile(profile);
    critical += result.errors.length;
    console.log(
      JSON.stringify({ universityFacts: profile.universitySlug, ...result }),
    );
  }
  for (const program of programs.filter(
    (item) => !university || item.universitySlug === university,
  )) {
    const result = validateProgram(program);
    critical += result.errors.length;
    console.log(JSON.stringify({ program: program.slug, ...result }));
  }
  if (critical) throw new Error(`Критических ошибок: ${critical}`);
}

async function importPrograms() {
  await validate();
  const targetPrograms = programs.filter(
    (item) => !university || item.universitySlug === university,
  );
  if (dryRun) {
    console.log(
      `DRY RUN: ${targetPrograms.length} программ прошли проверку; база не изменена.`,
    );
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL не задан. Сайт использует проверенный статический снимок; для импорта в PostgreSQL задайте DATABASE_URL.",
    );
  const prisma = new PrismaClient();
  try {
    const targetUniversitySlugs = new Set(
      targetPrograms.map(({ universitySlug }) => universitySlug),
    );
    const universityRows = new Map<string, { id: string }>();
    for (const profile of universityFactProfiles.filter(({ universitySlug }) =>
      targetUniversitySlugs.has(universitySlug),
    )) {
      const universityRecord = universities.find(
        ({ slug }) => slug === profile.universitySlug,
      )!;
      const published = <T>(field: SourcedValue<T>) =>
        field.status === "verified" ? field.value : null;
      const universityRow = await prisma.university.upsert({
        where: { slug: universityRecord.slug },
        update: {
          name: universityRecord.name,
          shortName: universityRecord.shortName,
          description: universityRecord.description,
          websiteUrl: profile.facts.website.value!,
          logoUrl: published(profile.facts.logoUrl),
          city: universityRecord.city,
          address: published(profile.facts.address),
          dormitoryCount: published(profile.facts.dormitoryCount),
          hasMilitaryCenter: published(profile.facts.militaryCenter),
          status: "PUBLISHED",
        },
        create: {
          slug: universityRecord.slug,
          name: universityRecord.name,
          shortName: universityRecord.shortName,
          description: universityRecord.description,
          websiteUrl: profile.facts.website.value!,
          logoUrl: published(profile.facts.logoUrl),
          city: universityRecord.city,
          address: published(profile.facts.address),
          dormitoryCount: published(profile.facts.dormitoryCount),
          hasMilitaryCenter: published(profile.facts.militaryCenter),
          status: "PUBLISHED",
        },
      });
      universityRows.set(profile.universitySlug, universityRow);

      for (const [factKey, field] of universitySourcedFields(profile)) {
        const current = await prisma.universityFactValue.findFirst({
          where: {
            universityId: universityRow.id,
            factKey,
            year: field.year,
          },
          orderBy: { version: "desc" },
        });
        const factSourceType = sourceTypeName(field.sourceKind);
        if (matchesPersistedUniversityFact(current, field)) continue;
        await prisma.universityFactValue.create({
          data: {
            universityId: universityRow.id,
            factKey,
            year: field.year,
            value: field.value === null ? undefined : field.value,
            status: statusName(field.status),
            sourceType: factSourceType,
            sourceUrl: field.sourceUrl,
            sourceName: field.sourceName,
            sourceDocumentTitle: field.sourceDocumentTitle,
            sourcePage: field.sourcePage,
            sourceSheet: field.sourceSheet,
            sourceRange: field.sourceRange,
            sourceSection: field.sourceSection,
            retrievedAt: new Date(field.retrievedAt),
            checkedAt: new Date(field.checkedAt),
            checkedBy: field.checkedBy,
            nextReviewAt: field.nextReviewAt
              ? new Date(field.nextReviewAt)
              : null,
            note: field.note,
            version: (current?.version ?? 0) + 1,
            supersedesId: current?.id,
          },
        });
      }

      for (const campus of profile.campuses) {
        if (campus.address.status !== "verified" || !campus.address.value)
          continue;
        await prisma.campus.upsert({
          where: { id: campus.id },
          update: {
            name: campus.name,
            address: campus.address.value,
          },
          create: {
            id: campus.id,
            universityId: universityRow.id,
            name: campus.name,
            address: campus.address.value,
          },
        });
      }
    }

    for (const program of targetPrograms) {
      const universityRow = universityRows.get(program.universitySlug)!;
      const row = await prisma.educationProgram.upsert({
        where: { slug: program.slug },
        update: {
          name: program.title,
          code: program.code,
          level: program.level === "Бакалавриат" ? "BACHELOR" : "SPECIALIST",
          form:
            program.form === "Очная"
              ? "FULL_TIME"
              : program.form === "Очно-заочная"
                ? "PART_TIME"
                : "EXTRAMURAL",
          durationMonths: Number.parseInt(program.duration) * 12,
          status: "PUBLISHED",
        },
        create: {
          universityId: universityRow.id,
          slug: program.slug,
          code: program.code,
          name: program.title,
          level: program.level === "Бакалавриат" ? "BACHELOR" : "SPECIALIST",
          form:
            program.form === "Очная"
              ? "FULL_TIME"
              : program.form === "Очно-заочная"
                ? "PART_TIME"
                : "EXTRAMURAL",
          durationMonths: Number.parseInt(program.duration) * 12,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      for (const [metricKey, field] of sourcedFields(program)) {
        const current = await prisma.metricValue.findFirst({
          where: { programId: row.id, metricKey, year: field.year },
          orderBy: { version: "desc" },
        });
        if (matchesPersistedMetric(current, field)) continue;
        await prisma.metricValue.create({
          data: {
            programId: row.id,
            metricKey,
            year: field.year,
            value: field.value === null ? undefined : field.value,
            status: statusName(field.status),
            sourceUrl: field.sourceUrl,
            sourceName: field.sourceName,
            sourceDocumentTitle: field.sourceDocumentTitle,
            sourcePage: field.sourcePage,
            sourceSheet: field.sourceSheet,
            sourceRange: field.sourceRange,
            sourceSection: field.sourceSection,
            retrievedAt: new Date(field.retrievedAt),
            checkedAt: new Date(field.checkedAt),
            checkedBy: field.checkedBy,
            nextReviewAt: field.nextReviewAt
              ? new Date(field.nextReviewAt)
              : null,
            note: field.note,
            version: (current?.version ?? 0) + 1,
            supersedesId: current?.id,
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log("Импорт завершён идемпотентно; неизменившиеся версии пропущены.");
}

async function report() {
  const rows = selected.map((adapter) => {
    const items = programs.filter(
      (program) => program.universitySlug === adapter.slug,
    );
    const programFields = items
      .flatMap(sourcedFields)
      .map(([, field]) => field);
    const profile = universityFactProfiles.find(
      ({ universitySlug }) => universitySlug === adapter.slug,
    )!;
    const universityFields = universitySourcedFields(profile).map(
      ([, field]) => field,
    );
    const fields = [...universityFields, ...programFields];
    const verified = fields.filter(
      (field) => field.status === "verified",
    ).length;
    const missing = fields.filter(
      (field) => field.status === "not_published",
    ).length;
    const review = fields.filter(
      (field) => field.status === "pending_review",
    ).length;
    const conflicts = fields.filter(
      (field) => field.status === "conflicting_sources",
    ).length;
    const coverage = fields.length
      ? Math.round((verified / fields.length) * 100)
      : 0;
    return {
      university: adapter.name,
      slug: adapter.slug,
      programs: items.length,
      indicators: fields.length,
      universityIndicators: universityFields.length,
      programIndicators: programFields.length,
      verified,
      missing,
      review,
      conflicts,
      coverage,
      years: [...new Set(fields.map((field) => field.year))].sort(),
      sources: adapter.sources,
      factSources: [
        ...new Map(
          universityFields.map((field) => [
            field.sourceUrl,
            {
              url: field.sourceUrl,
              type: field.sourceKind,
              checkedAt: field.checkedAt,
            },
          ]),
        ).values(),
      ],
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    publicationRule:
      "Только verified значения показаны как подтверждённые; null не заменяется нулём.",
    universities: rows,
  };
  await mkdir(join(process.cwd(), "data-sources", "reports"), {
    recursive: true,
  });
  await writeFile(
    join(process.cwd(), "data-sources", "reports", "quality-report.json"),
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
}

const actions: Record<string, () => Promise<void>> = {
  discover,
  fetch: fetchSources,
  parse: parseCache,
  validate,
  import: importPrograms,
  report,
};
if (!actions[command]) throw new Error(`Неизвестная команда ${command}`);
await actions[command]();
