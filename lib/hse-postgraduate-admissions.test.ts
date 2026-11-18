import { describe, expect, it } from "vitest";
import evidence from "@/data-sources/release/2026-12/evidence/2026-11-18-education-pathways.json";
import { hsePostgraduateOfferings } from "./hse-postgraduate-admissions";

const rows = evidence.aspAdmission2026.scientificSpecialtyProgrammeCampusRows;
const offerings = hsePostgraduateOfferings;

describe("HSE 2026 postgraduate admission programmes", () => {
  it("preserves 113 specialty rows in 51 exact programme and campus groups", () => {
    expect(rows).toHaveLength(113);
    expect(offerings).toHaveLength(51);
    expect(new Set(offerings.map((offering) => offering.id)).size).toBe(51);
    expect(
      Object.fromEntries(
        Object.keys(evidence.aspAdmission2026.programmeCountsByCampus).map(
          (campus) => [
            campus,
            offerings.filter((offering) => offering.campus === campus).length,
          ],
        ),
      ),
    ).toEqual({
      Москва: 32,
      "Нижний Новгород": 6,
      "Санкт-Петербург": 12,
      Пермь: 1,
    });
    for (const row of rows) {
      const offering = offerings.find(
        (entry) =>
          entry.campus === row.campus && entry.title === row.programTitle,
      )!;
      expect(offering.profile).toContain(`${row.code} ${row.specialtyTitle}`);
      expect(offering.code.split(" / ")).toContain(row.code);
      const source = evidence.sources.find(
        (entry) => entry.id === row.sourceId,
      )!;
      expect(offering.sourceUrl).toBe(source.url);
      expect(offering.sourceSha256).toBe(source.sha256);
      expect(offering.sourceYear).toBe(2026);
      expect(offering.sourceSection).toContain(
        `стр. ${row.sourceLocator.page}`,
      );
    }
  });

  it("keeps all five unmatched or blank campus budgets unknown without aliases", () => {
    const missing = offerings.filter(
      (offering) => offering.admissionDetails?.budgetPlaces?.value === null,
    );
    expect(
      missing.map((offering) => `${offering.campus}: ${offering.title}`).sort(),
    ).toEqual(
      [
        "Москва: Математическое моделирование, численные методы и комплексы программ",
        "Нижний Новгород: Лингвистика и литературоведение",
        "Нижний Новгород: Юриспруденция",
        "Санкт-Петербург: Гражданское право и процесс",
        "Пермь: Прикладная экономика",
      ].sort(),
    );
    expect(
      offerings.filter(
        (offering) =>
          offering.admissionDetails?.budgetPlaces?.status === "verified",
      ),
    ).toHaveLength(46);
    expect(
      missing.every(
        (offering) =>
          offering.admissionDetails?.budgetPlaces?.status === "pending_review",
      ),
    ).toBe(true);
  });

  it("uses campus programme places while preserving the 386-place university scope", () => {
    expect(evidence.aspAdmission2026.budgetTable.total).toBe(386);
    expect(
      Object.values(evidence.aspAdmission2026.budgetTable.campusTotals).reduce(
        (sum, places) => sum + (places ?? 0),
        0,
      ),
    ).toBe(386);
    expect(
      offerings.reduce(
        (sum, offering) =>
          sum + (offering.admissionDetails?.budgetPlaces?.value ?? 0),
        0,
      ),
    ).toBe(378);
    const computerScience = offerings.find(
      (entry) =>
        entry.campus === "Москва" && entry.title === "Компьютерные науки",
    )!;
    expect(computerScience.admissionDetails?.budgetPlaces?.value).toBe(25);
    expect(computerScience.admissionDetails?.note).toContain("Общий КЦП 33");
    expect(computerScience.admissionDetails?.note).toContain(
      "не назначается каждой специальности",
    );
    expect(computerScience.code.split(" / ")).toHaveLength(3);
  });

  it("keeps paid admission inapplicable, tuition unknown and entry requirements sourced", () => {
    for (const offering of offerings) {
      expect(offering.forms).toBe("Очная");
      expect(offering.duration).toBeNull();
      const details = offering.admissionDetails!;
      expect(details.annualTuition).toBeUndefined();
      expect(details.paidPlaces?.value).toBeNull();
      expect(details.paidPlaces?.status).toBe("not_applicable");
      expect(details.priorEducation?.value).toContain(
        "Специалитет или магистратура",
      );
      expect(details.exams?.value).toContain("до 15 баллов");
      expect(details.exams?.value).not.toMatch(/(?:минимум|от) 16/);
      for (const field of [
        details.priorEducation,
        details.exams,
        details.budgetPlaces,
        details.paidPlaces,
      ]) {
        expect(field?.sourceKind).toMatch(/^(?:docx|html)$/);
        expect(field?.sourceUrl).toMatch(
          /^https:\/\/(?:www\.|aspirantura\.)hse\.ru\//,
        );
        expect(field?.sourceName).toBe("НИУ ВШЭ");
        expect(field?.sourceDocumentTitle).toBeTruthy();
        expect(field?.sourceSection).toBeTruthy();
        expect(field?.checkedBy).toBe("Редакция Поступай");
        expect(Number.isFinite(Date.parse(field!.checkedAt))).toBe(true);
        expect(Number.isFinite(Date.parse(field!.retrievedAt))).toBe(true);
        expect(field?.year).toBe(2026);
      }
    }
  });
});
