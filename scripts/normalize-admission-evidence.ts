import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  admissionFactId,
  admissionFactSchema,
} from "../lib/admissions/facts-schema";
import type { AdmissionFact } from "../lib/admissions/facts";

/**
 * Normalizes the reviewed admissions evidence packages into admission facts
 * (TASK-2026-11-25, step 4). Each university has its own reader because each
 * package keeps the layout of its official tables. A reader copies published
 * numbers only: no stage, competition or scale is inferred, a value without a
 * year is skipped, and footnotes travel with the fact as notes.
 *   tsx scripts/normalize-admission-evidence.ts
 * writes data-sources/admissions/facts.json.
 */
const EVIDENCE = "data-sources/release/2026-12/evidence";
const OUTPUT = "data-sources/admissions/facts.json";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Draft = Omit<
  AdmissionFact,
  "id" | "universitySlug" | "source" | "period"
> & {
  period?: AdmissionFact["period"];
  sourceId: string;
  section?: string | null;
};

function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
}

function sourceOf(pkg: Json, id: string, section: string | null = null) {
  const list: Json[] = Array.isArray(pkg.sources)
    ? pkg.sources
    : Object.entries(pkg.sources ?? {}).map(([key, value]) => ({
        id: key,
        ...(value as Json),
      }));
  const row = list.find((entry) => (entry.id ?? entry.sourceId) === id);
  if (!row)
    throw new Error(`Нет источника ${id} в пакете ${pkg.universitySlug}`);
  return {
    url: row.sourceUrl ?? row.url,
    checkedAt: row.checkedAt,
    sha256: /^[a-f0-9]{64}$/.test(row.sourceSha256 ?? "")
      ? row.sourceSha256
      : null,
    section: section ?? row.locator ?? null,
  };
}

function base(
  partial: Partial<Draft> &
    Pick<Draft, "year" | "kind" | "label" | "value" | "sourceId">,
): Draft {
  return {
    funding: null,
    competition: null,
    stage: null,
    code: null,
    form: null,
    campus: null,
    note: null,
    unit:
      partial.kind === "tuition"
        ? "rub"
        : partial.kind === "places"
          ? "places"
          : "points",
    ...partial,
  };
}

const readers: Record<string, (pkg: Json) => Draft[]> = {
  mpei(pkg) {
    const out: Draft[] = [];
    const s26 = pkg.publishedPassingScores2026;
    for (const g of s26.groups)
      for (const funding of ["budget", "paid"] as const) {
        const side = g[funding];
        if (!side) continue;
        const common = {
          year: s26.year,
          funding,
          code: g.code,
          label: g.group,
          form: g.form,
          sourceId: s26.source,
        };
        if (number(side.score) !== null)
          out.push(
            base({
              ...common,
              kind: "passing_score",
              value: number(side.score)!,
            }),
          );
        if (number(side.places) !== null)
          out.push(
            base({
              ...common,
              kind: "places",
              value: number(side.places)!,
              note: s26.placesMeaning ?? null,
            }),
          );
      }
    const s25 = pkg.publishedPassingScores2025;
    for (const funding of ["budget", "paid"] as const)
      for (const g of s25[funding] ?? [])
        if (number(g.score) !== null)
          out.push(
            base({
              year: s25.year,
              kind: "passing_score",
              funding,
              code: g.code,
              label: g.group,
              form: g.form,
              value: number(g.score)!,
              sourceId: s25.source,
            }),
          );
    const t = pkg.tuition;
    for (const row of t.rows)
      out.push(
        base({
          year: t.year,
          kind: "tuition",
          funding: "paid",
          code: row.code,
          label: `Институт ${row.institute}`,
          form: row.form,
          value: row.annualRub,
          period: "year",
          note: `Первый курс; приказ № ${t.orderNumber} от ${t.orderDate}`,
          sourceId: t.source,
        }),
      );
    return out;
  },
  mai(pkg) {
    const out: Draft[] = [];
    for (const row of pkg.publishedPassingScores) {
      const common = {
        year: row.year,
        code: row.code,
        label: row.title,
        stage: row.stage,
        sourceId: row.source,
      };
      for (const [key, competition] of [
        ["budgetWithHousing", "с общежитием"],
        ["budgetWithoutHousing", "без общежития"],
      ] as const)
        if (number(row[key]) !== null)
          out.push(
            base({
              ...common,
              kind: "passing_score",
              funding: "budget",
              competition,
              value: number(row[key])!,
            }),
          );
      for (const paid of row.paid ?? [])
        if (number(paid.score) !== null)
          out.push(
            base({
              ...common,
              kind: "passing_score",
              funding: "paid",
              code: paid.code,
              form: paid.form,
              value: number(paid.score)!,
            }),
          );
    }
    for (const row of pkg.tuition.rows)
      out.push(
        base({
          year: pkg.tuition.year,
          kind: "tuition",
          funding: "paid",
          code: row.code,
          label: row.title,
          form: row.form,
          value: row.annualRub,
          period: "year",
          note: "Первый курс",
          sourceId: pkg.tuition.source,
        }),
      );
    for (const [funding, block] of [
      ["paid", pkg.places?.paid],
      ["budget", pkg.places?.budget],
    ] as const)
      for (const row of block?.rows ?? [])
        if (number(row.seats) !== null)
          out.push(
            base({
              year: block.year ?? 2026,
              kind: "places",
              funding,
              code: row.code ?? (row.codes ?? []).join(", "),
              label: row.title,
              form: row.form ?? null,
              value: number(row.seats)!,
              sourceId: block.source,
            }),
          );
    return out;
  },
  mipt(pkg) {
    const out: Draft[] = [];
    for (const row of pkg.publishedPassingScores) {
      const common = {
        year: row.year,
        code: row.code,
        label: `${row.competitionGroup} (${row.school})`,
        stage: row.stage,
        sourceId: row.source,
      };
      if (number(row.budgetGeneralCompetition) !== null)
        out.push(
          base({
            ...common,
            kind: "passing_score",
            funding: "budget",
            competition: "общий конкурс",
            value: number(row.budgetGeneralCompetition)!,
          }),
        );
      if (number(row.paid) !== null)
        out.push(
          base({
            ...common,
            kind: "passing_score",
            funding: "paid",
            value: number(row.paid)!,
          }),
        );
    }
    for (const group of pkg.tuition.groups)
      for (const code of group.codes ?? [null])
        out.push(
          base({
            year: pkg.tuition.year,
            kind: "tuition",
            funding: "paid",
            code,
            // A price published for a whole school keeps that scope as its label.
            label: code
              ? `Обучение на языке: ${group.language}`
              : `${group.scope}, обучение на языке: ${group.language}`,
            value: group.annualRub,
            period: "year",
            note: `${pkg.tuition.schoolYear}; ${pkg.tuition.section}`,
            sourceId: pkg.tuition.source,
          }),
        );
    return out;
  },
  misis(pkg) {
    const out: Draft[] = [];
    for (const funding of ["budget", "paid"] as const) {
      const block = pkg.publishedPassingScores[funding];
      for (const row of block?.rows ?? [])
        for (const [year, value] of Object.entries(row.scores ?? {}))
          if (number(value) !== null)
            out.push(
              base({
                year: Number(year),
                kind: "passing_score",
                funding,
                code: row.code,
                label: `${row.title} (${row.institute})`,
                stage: block.stage ?? null,
                value: number(value)!,
                sourceId: block.source,
              }),
            );
    }
    for (const row of pkg.tuition.rows)
      out.push(
        base({
          year: pkg.tuition.year,
          kind: "tuition",
          funding: "paid",
          code: row.code,
          label: row.title,
          form: pkg.tuition.form ?? null,
          value: row.annualRub,
          period: "year",
          note: `Первый курс, ${pkg.tuition.schoolYear}`,
          sourceId: pkg.tuition.source,
        }),
      );
    const budget = pkg.places.budget;
    for (const row of budget.rows) {
      const common = {
        year: budget.kcpYear,
        kind: "places" as const,
        funding: "budget" as const,
        code: row.code,
        label: `${row.title} (${row.institute})`,
        form: row.form,
      };
      if (number(row.seats) !== null)
        out.push(
          base({
            ...common,
            competition: "контрольные цифры приёма",
            value: number(row.seats)!,
            sourceId: budget.kcpSource,
          }),
        );
      for (const [key, competition] of [
        ["specialQuota", "особая квота"],
        ["separateQuota", "отдельная квота"],
        ["targetQuota", "целевая квота"],
      ] as const)
        if (number(row[key]) !== null)
          out.push(
            base({
              ...common,
              competition,
              value: number(row[key])!,
              sourceId: budget.quotaSource,
            }),
          );
    }
    const paid = pkg.places.paid;
    for (const row of paid.rows)
      if (number(row.seats) !== null)
        out.push(
          base({
            year: paid.year ?? budget.kcpYear,
            kind: "places",
            funding: "paid",
            code: row.code,
            label: `${row.title} (${row.institute})`,
            form: row.form,
            value: number(row.seats)!,
            sourceId: paid.source,
          }),
        );
    return out;
  },
  mospolytech(pkg) {
    const out: Draft[] = [];
    for (const row of pkg.publishedBudgetResults)
      if (number(row.value) !== null)
        out.push(
          base({
            year: row.year,
            kind: "passing_score",
            funding: "budget",
            code: row.competitionCode,
            label: row.label,
            form: row.form,
            campus: row.campus,
            stage: row.stage,
            value: number(row.value)!,
            sourceId: row.source,
            section: `стр. ${row.page}, табл. ${row.table}, строка ${row.row}`,
          }),
        );
    const paid = pkg.observedPaidResults2026;
    for (const row of paid.rows)
      if (number(row.paidMinimum) !== null)
        out.push(
          base({
            year: paid.year,
            kind: "passing_score",
            funding: "paid",
            code: row.competitionCode,
            label: `${row.direction}: ${row.profile}`,
            form: row.form,
            campus: paid.campus,
            value: number(row.paidMinimum)!,
            note: paid.method ?? null,
            sourceId: paid.source,
          }),
        );
    return out;
  },
  mephi(pkg) {
    const out: Draft[] = [];
    for (const row of pkg.results2025Budget ?? [])
      if (row.status === "verified" && number(row.value) !== null)
        out.push(
          base({
            year: row.year,
            kind: "passing_score",
            funding: row.funding,
            code: row.code,
            label: row.title,
            form: row.form,
            campus: row.campus,
            value: number(row.value)!,
            sourceId: row.source,
            section: row.sourceSection,
          }),
        );
    for (const row of pkg.results2026Budget ?? [])
      if (row.status === "verified" && number(row.value) !== null)
        out.push(
          base({
            year: row.year,
            kind: "passing_score",
            funding: row.funding,
            code: row.codes.join(", "),
            label: row.titleAsPublished,
            campus: row.campus,
            stage: row.stage,
            value: number(row.value)!,
            sourceId: row.source,
            section: row.sourceSection,
          }),
        );
    return out;
  },
  rsuh(pkg) {
    const out: Draft[] = [];
    for (const archive of pkg.archives)
      for (const row of archive.rows)
        if (
          number(row.score) !== null &&
          ["budget", "paid"].includes(row.funding)
        )
          out.push(
            base({
              year: archive.year,
              kind: "passing_score",
              funding: row.funding,
              label: row.programme,
              form: row.form,
              stage: archive.stage,
              value: number(row.score)!,
              note: row.condition ?? null,
              sourceId: archive.source,
              section: `стр. ${row.page}`,
            }),
          );
    return out;
  },
  rudn(pkg) {
    const out: Draft[] = [];
    for (const [funding, block] of [
      ["budget", pkg.archive.budget],
      ["paid", pkg.archive.paid],
    ] as const) {
      const rows = new Map<number, Json>(
        block.rows.map((row: Json) => [row.row, row]),
      );
      for (const result of block.results) {
        const covered = (result.rows as number[])
          .map((index) => rows.get(index))
          .filter(Boolean) as Json[];
        if (!covered.length || number(result.passingScore) === null) continue;
        const forms = [...new Set(covered.map((row) => row.form))];
        out.push(
          base({
            year: result.year,
            kind: "passing_score",
            funding,
            competition: [
              ...new Set(covered.map((row) => row.fundingLabel)),
            ].join("; "),
            code: [...new Set(covered.map((row) => row.code))].join(", "),
            label: covered
              .map((row) => `${row.faculty}: ${row.direction} — ${row.group}`)
              .join(" + "),
            form: forms.length === 1 ? forms[0] : forms.join("; "),
            stage: block.stage,
            value: number(result.passingScore)!,
            note:
              covered.length > 1
                ? "Один результат опубликован для объединённых строк таблицы."
                : null,
            sourceId: block.source,
            section: `стр. ${block.sourcePage}, строки ${result.rows.join(", ")}`,
          }),
        );
      }
    }
    return out;
  },
  ranepa(pkg) {
    const out: Draft[] = [];
    const scores = pkg.publishedPassingScores;
    for (const funding of ["budget", "paid"] as const)
      for (const row of scores[funding] ?? [])
        for (const [year, value] of Object.entries(row.scores ?? {}))
          if (number(value) !== null)
            out.push(
              base({
                year: Number(year),
                kind: "passing_score",
                funding,
                label: `${row.direction}: ${row.publishedName}`,
                form: row.form,
                stage: scores.stage,
                value: number(value)!,
                sourceId: scores.source,
              }),
            );
    for (const row of pkg.tuition.rows)
      out.push(
        base({
          year: pkg.tuition.year,
          kind: "tuition",
          funding: "paid",
          code: row.code,
          label: `${row.program} (${row.institute})`,
          form: row.form,
          value: row.annualRub,
          period: "year",
          note: "Первый курс",
          sourceId: pkg.tuition.source,
          section: `стр. ${row.page}`,
        }),
      );
    return out;
  },
  bmstu(pkg) {
    const out: Draft[] = [];
    const paid = pkg.paidArchive;
    const minimum = (paid.columns as string[]).indexOf("minimum");
    for (const row of paid.rows)
      for (const [year, cells] of Object.entries(row.results ?? {}))
        if (Array.isArray(cells) && number(cells[minimum]) !== null)
          out.push(
            base({
              year: Number(year),
              kind: "passing_score",
              funding: "paid",
              code: row.code,
              label: row.department
                ? `Кафедра ${row.department}`
                : "Направление в целом",
              stage: paid.stage,
              value: number(cells[minimum])!,
              note: "Минимальный балл среди зачисленных по договору.",
              sourceId: paid.source,
            }),
          );
    const budget = pkg.budgetArchive;
    for (const row of budget.rows) {
      const common = {
        year: budget.year,
        funding: "budget" as const,
        competition: budget.competition === "general" ? "общий конкурс" : null,
        code: row.code,
        label: `Кафедра ${row.department}`,
        stage: budget.stage,
        sourceId: budget.source,
      };
      if (number(row.score) !== null)
        out.push(
          base({ ...common, kind: "passing_score", value: number(row.score)! }),
        );
      if (number(row.places) !== null)
        out.push(
          base({ ...common, kind: "places", value: number(row.places)! }),
        );
    }
    const tuition = pkg.annualTuition;
    for (const row of tuition.rows)
      if (number(row.rublesPerYear) !== null)
        out.push(
          base({
            year: tuition.year,
            kind: "tuition",
            funding: "paid",
            code: row.code,
            label: row.title,
            value: number(row.rublesPerYear)!,
            period: "year",
            note: `Курс ${tuition.course}`,
            sourceId: tuition.source,
          }),
        );
    return out;
  },
  pirogov(pkg) {
    const out: Draft[] = [];
    for (const archive of pkg.archives)
      for (const row of archive.rows)
        for (const [key, funding] of [
          ["budgetPassingScore", "budget"],
          ["paidPassingScore", "paid"],
        ] as const)
          if (number(row[key]) !== null)
            out.push(
              base({
                year: archive.year,
                kind: "passing_score",
                funding,
                competition:
                  funding === "budget" && archive.competition === "general"
                    ? "общий конкурс"
                    : null,
                code: row.code,
                label: row.name,
                form: row.form,
                stage: archive.stage,
                value: number(row[key])!,
                sourceId: archive.source,
                section: `стр. ${row.page}`,
              }),
            );
    const tuition = pkg.annualTuition;
    const year = Number(String(tuition.academicYear ?? "").slice(0, 4));
    if (year)
      for (const row of tuition.rows)
        if (number(row.rubles) !== null)
          out.push(
            base({
              year,
              kind: "tuition",
              funding: "paid",
              competition: tuition.applicants ?? null,
              code: row.code,
              label: row.name,
              value: number(row.rubles)!,
              period: "year",
              note: tuition.academicYear,
              sourceId: tuition.source,
              section: `стр. ${row.page}`,
            }),
          );
    return out;
  },
  msal(pkg) {
    const out: Draft[] = [];
    const campaign = pkg.campaign2026;
    const scores = campaign.publishedPassingScores;
    for (const row of scores.rows)
      for (const score of row.scores)
        if (number(score.minimum) !== null)
          out.push(
            base({
              year: 2026,
              kind: "passing_score",
              funding: score.funding,
              code: row.code,
              label: row.label,
              form: score.form,
              stage: scores.stage,
              value: number(score.minimum)!,
              note:
                score.funding === "budget" ? (scores.footnote ?? null) : null,
              sourceId: scores.source,
            }),
          );
    const tuition = campaign.tuition;
    for (const row of tuition.rows)
      out.push(
        base({
          year: 2026,
          kind: "tuition",
          funding: "paid",
          code: row.code,
          label: `${row.profile} (${row.institute})`,
          form: row.form,
          value: row.amountRubPerYear,
          period: "year",
          note: `${tuition.academicYear}; первый год`,
          sourceId: tuition.source,
          section: `стр. ${row.pdfPage}`,
        }),
      );
    const seats = campaign.announcedSeats;
    for (const row of seats.rows)
      for (const form of row.forms)
        for (const [key, funding, competition] of [
          ["generalBudget", "budget", "общий конкурс"],
          ["specialQuota", "budget", "особая квота"],
          ["targetQuota", "budget", "целевая квота"],
          ["separateQuota", "budget", "отдельная квота"],
          ["paid", "paid", null],
        ] as const)
          if (number(form[key]) !== null)
            out.push(
              base({
                year: 2026,
                kind: "places",
                funding,
                competition,
                code: row.code,
                label: row.groupLabel,
                form: form.form,
                value: number(form[key])!,
                note: seats.note ?? null,
                sourceId: seats.source,
                section: `стр. ${row.pdfPage}, строка ${row.sourceRow}`,
              }),
            );
    return out;
  },
  sechenov(pkg) {
    const out: Draft[] = [];
    const classify = (label: string) =>
      /договор/i.test(label) ? ("paid" as const) : ("budget" as const);
    const programs = pkg.campaign2026.programs;
    for (const row of programs.rows) {
      const common = {
        year: 2026,
        code: row.code,
        label: `${row.profile} (${row.institute})`,
        form: row.form,
        sourceId: programs.source,
        section: row.sourceSection,
      };
      for (const place of row.places ?? [])
        if (number(place.value) !== null)
          out.push(
            base({
              ...common,
              kind: "places",
              funding: classify(place.label),
              competition: place.label,
              value: number(place.value)!,
            }),
          );
      for (const [category, years] of Object.entries(row.tuitionRub ?? {})) {
        const first = (years as Json[]).find(
          (entry) => entry.label === "Первый год обучения",
        );
        if (first && number(first.value) !== null)
          out.push(
            base({
              ...common,
              kind: "tuition",
              funding: "paid",
              competition: category,
              value: number(first.value)!,
              period: "year",
              note: "Первый год обучения",
            }),
          );
      }
    }
    const history = pkg.historicalPassingScores2025;
    for (const row of history.rows)
      for (const score of row.minimumScoresByFundingLabel ?? [])
        if (number(score.value) !== null)
          out.push(
            base({
              year: history.year,
              kind: "passing_score",
              funding: classify(score.label),
              competition: score.label,
              code: row.code,
              label: `${row.profile} (${row.institute})`,
              form: row.form,
              stage: history.stage,
              value: number(score.value)!,
              sourceId: history.source,
              section: row.sourceSection,
            }),
          );
    return out;
  },
  muctr(pkg) {
    const out: Draft[] = [];
    const places = pkg.campaign2026.places;
    for (const row of places.directions)
      for (const [key, funding, competition] of [
        ["generalPlaces", "budget", "общий конкурс"],
        ["specialQuota", "budget", "особая квота"],
        ["separateQuota", "budget", "отдельная квота"],
        ["targetQuota", "budget", "целевая квота"],
        ["paidPlaces", "paid", null],
      ] as const)
        if (number(row[key]) !== null)
          out.push(
            base({
              year: 2026,
              kind: "places",
              funding,
              competition,
              code: row.code,
              label: row.title,
              form: row.form,
              value: number(row[key])!,
              sourceId: places.source,
            }),
          );
    // The archived minimums carry no year in the source: kept in evidence only.
    return out;
  },
  mgu(pkg) {
    const out: Draft[] = [];
    const block = pkg.admissions.postgraduatePlaces;
    for (const group of block.groups)
      for (const [key, funding] of [
        ["budgetPlaces", "budget"],
        ["paidPlaces", "paid"],
      ] as const)
        if (number(group[key]) !== null)
          out.push(
            base({
              year: block.year,
              kind: "places",
              funding,
              competition: "аспирантура, группа научных специальностей",
              code: group.code,
              label: group.title,
              value: number(group[key])!,
              note: block.note ?? null,
              sourceId: block.sourceId,
              section: block.locator ?? null,
            }),
          );
    return out;
  },
};

const PACKAGES: Record<string, string> = {
  mgu: "2026-11-20-mgu-admissions.json",
  bmstu: "2026-11-21-bmstu-admissions.json",
  mephi: "2026-11-21-mephi-admissions.json",
  mospolytech: "2026-11-21-mospolytech-admissions.json",
  muctr: "2026-11-21-muctr-admissions.json",
  pirogov: "2026-11-21-pirogov-admissions.json",
  rsuh: "2026-11-21-rsuh-admissions.json",
  mai: "2026-11-22-mai-admissions.json",
  misis: "2026-11-22-misis-admissions.json",
  msal: "2026-11-22-msal-admissions.json",
  sechenov: "2026-11-22-sechenov-admissions.json",
  mipt: "2026-11-23-mipt-admissions.json",
  mpei: "2026-11-23-mpei-admissions.json",
  ranepa: "2026-11-23-ranepa-admissions.json",
  rudn: "2026-11-23-rudn-admissions.json",
};

async function main() {
  const facts: AdmissionFact[] = [];
  const packages: Array<{
    universitySlug: string;
    file: string;
    sha256: string;
    facts: number;
  }> = [];
  for (const [slug, file] of Object.entries(PACKAGES)) {
    const raw = await readFile(path.join(EVIDENCE, file));
    const pkg = JSON.parse(raw.toString("utf8")) as Json;
    if (pkg.universitySlug && pkg.universitySlug !== slug)
      throw new Error(`Пакет ${file} относится к ${pkg.universitySlug}`);
    pkg.universitySlug = slug;
    const seen = new Set<string>();
    let count = 0;
    for (const draft of readers[slug](pkg)) {
      const { sourceId, section, ...rest } = draft;
      const fact = {
        ...rest,
        period: rest.period ?? null,
        universitySlug: slug,
        label: String(rest.label).trim(),
        source: sourceOf(pkg, sourceId, section ?? null),
      };
      const withId = { ...fact, id: admissionFactId(fact) };
      if (seen.has(withId.id)) continue;
      seen.add(withId.id);
      facts.push(admissionFactSchema.parse(withId));
      count++;
    }
    packages.push({
      universitySlug: slug,
      file,
      sha256: createHash("sha256").update(raw).digest("hex"),
      facts: count,
    });
  }
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(
    OUTPUT,
    JSON.stringify(
      {
        note: "Опубликованные вузами числа из пакетов доказательств: проходные, места и цены; бюджет и договор раздельно, год и источник у каждого значения. Этап, конкурс и шкала — только если указаны в источнике.",
        packages,
        facts,
      },
      null,
      2,
    ) + "\n",
  );
  const byKind: Record<string, number> = {};
  for (const fact of facts)
    byKind[`${fact.kind}:${fact.funding}`] =
      (byKind[`${fact.kind}:${fact.funding}`] ?? 0) + 1;
  console.log(
    JSON.stringify({
      facts: facts.length,
      byKind,
      packages: packages.map((p) => `${p.universitySlug}:${p.facts}`),
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
