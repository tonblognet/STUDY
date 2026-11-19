import { describe, expect, it } from "vitest";
import type { DataStatus, SourcedValue } from "@/lib/admissions/types";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { HseAdmissionResources } from "@/lib/hse-admission-resources";
import type { HseMasterTuition } from "@/lib/hse-admissions";
import type { DirectoryDetails } from "@/lib/university-directory-details";
import { homeEducationPaths, homeTuitionExample } from "./home-content";

function fact<T>(value: T): SourcedValue<T> {
  return {
    value,
    year: 2026,
    status: "verified",
    sourceKind: "html",
    sourceUrl: "https://perm.hse.ru/ma/itlaw/admission/",
    sourceName: "НИУ ВШЭ — Пермь",
    retrievedAt: "2026-11-18T00:00:00.000Z",
    checkedAt: "2026-11-18T00:00:00.000Z",
    checkedBy: "Проверка тестового примера",
  };
}

function master(): HseMasterTuition {
  return {
    title: "ИТ-юрист",
    code: "40.04.01",
    campus: "Пермь",
    form: "Очная",
    tuition: fact(480000),
    sourceUrl: "https://perm.hse.ru/ma/itlaw/admission/",
    programUrl: "https://perm.hse.ru/ma/itlaw/",
    budgetPlaces: fact(10),
    paidPlaces: fact(10),
    exams: fact("Портфолио"),
    faculty: null,
    duration: "2 года",
  };
}

function publication(rows?: HseMasterTuition[]): CatalogSnapshot {
  const directory: DirectoryDetails = {
    universitySlug: "hse",
    educationAreas: [],
    fields: {},
    licenseRegistry: { value: "unknown", checkedAt: "2026-11-18", note: "" },
    licenseExtract: null,
    documents: [],
    offerings: [],
    // Other admission resources are irrelevant to this pure price selection.
    admissionResources:
      rows === undefined
        ? undefined
        : ({ masterTuition: rows } as HseAdmissionResources),
  };
  return {
    schemaVersion: 1,
    universities: [],
    programs: [],
    universityFacts: [],
    directoryDetails: [directory],
    admissionCampaigns: [],
  };
}

describe("home content from the selected publication", () => {
  it("provides all five education paths in the intended order with canonical links", () => {
    expect(
      homeEducationPaths.map(({ key, label, href }) => ({ key, label, href })),
    ).toEqual([
      { key: "college", label: "Колледж", href: "/programs?track=college" },
      {
        key: "undergraduate",
        label: "Бакалавриат и специалитет",
        href: "/programs",
      },
      { key: "master", label: "Магистратура", href: "/programs?track=master" },
      {
        key: "aspirantura",
        label: "Аспирантура",
        href: "/programs?track=aspirantura",
      },
      {
        key: "doctorate",
        label: "Докторантура",
        href: "/programs?track=doctorate",
      },
    ]);
    expect(
      homeEducationPaths.find((path) => path.key === "master"),
    ).toMatchObject({
      headline: "Глубже в профессию",
      details: [
        "Вступительные испытания и портфолио",
        "Бюджет и платное обучение",
      ],
      action: "Смотреть магистратуру",
    });
  });

  it("does not imply a confirmed doctoral intake or EGE admission at every level", () => {
    const doctorate = homeEducationPaths.find(
      (path) => path.key === "doctorate",
    )!;
    expect(doctorate.description).toContain(
      "Условия отдельных наборов пока уточняются",
    );
    expect(doctorate.details).toContain(
      "Набор, места и стоимость требуют проверки",
    );
    expect(doctorate.action).toBe("Информация о докторантуре");
    for (const path of homeEducationPaths.filter(
      (path) => path.key !== "undergraduate",
    ))
      expect([path.description, ...path.details].join(" ")).not.toContain(
        "ЕГЭ",
      );
  });

  it("returns no repository fallback for a legacy publication without resources", () => {
    expect(homeTuitionExample(publication())).toBeNull();
    expect(homeTuitionExample(publication([]))).toBeNull();
    const anotherUniversity = publication([master()]);
    anotherUniversity.directoryDetails[0].universitySlug = "another-university";
    expect(homeTuitionExample(anotherUniversity)).toBeNull();
  });

  it("reflects the selected resource value, year and source without mutating it", () => {
    const row = master();
    row.tuition = {
      ...row.tuition,
      value: 527000,
      year: 2027,
      sourceUrl: "https://perm.hse.ru/ma/itlaw/admission/?year=2027",
    };
    const catalog = publication([row]);
    const before = JSON.stringify(catalog);
    const selected = homeTuitionExample(catalog)!;
    expect(selected).toEqual({
      title: "ИТ-юрист",
      campus: "Пермь",
      tuition: row.tuition,
    });
    expect(JSON.stringify(catalog)).toBe(before);
    selected.tuition.value = 1;
    expect(row.tuition.value).toBe(527000);
  });

  it.each<DataStatus>([
    "pending_review",
    "conflicting_sources",
    "not_published",
    "not_applicable",
    "outdated",
  ])("does not promote a %s price into a public example", (status) => {
    const row = master();
    row.tuition.status = status;
    expect(homeTuitionExample(publication([row]))).toBeNull();
  });

  it("requires the exact programme and campus and a usable sourced price", () => {
    const wrongCampus = master();
    wrongCampus.campus = "Москва";
    const wrongTitle = master();
    wrongTitle.title = "Другая юридическая программа";
    expect(
      homeTuitionExample(publication([wrongCampus, wrongTitle])),
    ).toBeNull();
    for (const patch of [
      { value: null },
      { value: -1 },
      { value: Number.NaN },
      { year: Number.NaN },
      { year: 0 },
      { sourceUrl: "" },
    ]) {
      const row = master();
      row.tuition = { ...row.tuition, ...patch };
      expect(homeTuitionExample(publication([row]))).toBeNull();
    }
  });
});
