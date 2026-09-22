import { createHash } from "node:crypto";
import { validAggregateScore } from "../data-sources/core/score-range";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import {
  assertAdapterCoverage,
  assertOfficialSource,
} from "../data-sources/core/adapter";
import { validateUniversityFactProfile } from "../data-sources/core/university-fact-validation";
import {
  getUniversityAdapter,
  universityAdapters,
} from "../data-sources/universities";
import { programs, universities, type Program } from "../lib/data";
import {
  getAdmissionCampaign,
  validateAdmissionCampaign,
} from "../lib/university-admission-campaigns";
import type { SourcedValue } from "../lib/admissions/types";
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
    ...(program.dviMinimum
      ? [["dvi_minimum", program.dviMinimum] as [string, SourcedValue<unknown>]]
      : []),
    ...(program.durationValue
      ? [["duration", program.durationValue] as [string, SourcedValue<unknown>]]
      : []),
    ...Object.entries(program.admissionsContact ?? {}).map(
      ([key, field]) =>
        [`admissions_${key}`, field] as [string, SourcedValue<unknown>],
    ),
    ["individual_achievements_max", program.individualAchievementsMax],
    ["quota_general", program.quotas.general],
    ["quota_special", program.quotas.special],
    ["quota_separate", program.quotas.separate],
    ["quota_target", program.quotas.target],
    ["hostel", program.hostel],
    ["military_center", program.militaryCenter],
    ...program.examRequirements.flatMap((item) =>
      item.subjectMinimums
        ? Object.entries(item.subjectMinimums).map(
            ([subject, minimum]) =>
              [`exam_minimum:${subject}`, minimum] as [
                string,
                SourcedValue<unknown>,
              ],
          )
        : [
            [`exam_minimum:${item.subjects.join("|")}`, item.minimum] as [
              string,
              SourcedValue<unknown>,
            ],
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
      !validAggregateScore(field.value)
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
  for (const adapter of selected) {
    const campaign = getAdmissionCampaign(adapter.slug);
    if (!campaign) continue;
    const errors = validateAdmissionCampaign(campaign);
    for (const source of Object.values(campaign.sources)) {
      const registered = adapter.sources.find(
        (item) => item.url === source.url,
      );
      if (!registered)
        errors.push(`Источник кампании не зарегистрирован: ${source.url}`);
      else {
        try {
          assertOfficialSource(adapter, registered);
        } catch (error) {
          errors.push(String(error));
        }
      }
    }
    critical += errors.length;
    console.log(JSON.stringify({ admissionCampaign: adapter.slug, errors }));
  }
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
  const { runCatalogImport } = await import("./catalog");
  await runCatalogImport(process.argv.slice(2));
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
      supplementaryAdmissionCampaign: (() => {
        const campaign = getAdmissionCampaign(adapter.slug);
        return campaign
          ? {
              year: campaign.year,
              groups: campaign.groups.length,
              sourceDocuments: Object.values(campaign.sources),
              matchingEnabled: false,
              validationErrors: validateAdmissionCampaign(campaign),
              knownTuition: campaign.groups.filter(
                (group) => group.tuition.value !== null,
              ).length,
              unknownPaidPlaces: campaign.groups.filter(
                (group) => group.paidPlaces.value === null,
              ).length,
            }
          : null;
      })(),
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
