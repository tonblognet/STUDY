import { describe, expect, it } from "vitest";
import snapshot from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-full-admissions.json";
import { hseMasterTuition } from "./hse-admissions";

function master(title: string, code: string, campus = "Москва") {
  const matches = hseMasterTuition.filter(
    (row) => row.title === title && row.code === code && row.campus === campus,
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe("HSE verified master admission completions for 2026", () => {
  it.each([
    [
      "Математика машинного обучения",
      "01.04.02",
      "Конкурсный отбор (портфолио)",
    ],
    ["Системное программирование", "09.04.04", "Собеседование"],
    [
      "Обучение и оценивание как наука",
      "37.04.01",
      "Конкурсный отбор (портфолио)",
    ],
    [
      "Современные технологии преподавания дизайна и искусства",
      "44.04.01",
      "Конкурсный отбор (портфолио)",
    ],
    ["Исторические исследования", "46.04.01", "Конкурсный отбор (портфолио)"],
    [
      "Практики современного искусства",
      "50.04.02",
      "Конкурсный отбор (портфолио)",
    ],
    ["Дизайн", "54.04.01", "Конкурсный отбор (портфолио)"],
    ["Дизайн среды", "54.04.01", "Конкурсный отбор (портфолио)"],
    [
      "Коммуникационный и цифровой дизайн",
      "54.04.01",
      "Конкурсный отбор (портфолио)",
    ],
    ["Мода", "54.04.01", "Конкурсный отбор (портфолио)"],
    ["Интерактивный дизайн", "54.04.01", "Конкурсный отбор (портфолио)"],
  ])(
    "retains the central 2026 examination and locator for %s",
    (title, code, exam) => {
      const row = master(title, code);
      expect(row.form).toBe("Очная");
      expect(row.exams.value).toBe(exam);
      expect(row.exams.status).toBe("verified");
      expect(row.exams.year).toBe(2026);
      expect(row.exams.sourceKind).toBe("html");
      expect(row.exams.sourceUrl).toBe("https://ma.hse.ru/entrance");
      expect(row.exams.sourceSection).toContain(code);
      expect(row.exams.sourceSection).toContain(title);
      expect(row.exams.sourceSection).toContain("строка");
    },
  );

  it.each([
    [
      "Современные технологии преподавания дизайна и искусства",
      "44.04.01",
      25,
      25,
      560_000,
    ],
    ["Практики современного искусства", "50.04.02", null, 50, 580_000],
    ["Дизайн", "54.04.01", 30, 200, 790_000],
    ["Дизайн среды", "54.04.01", null, 40, 790_000],
    ["Коммуникационный и цифровой дизайн", "54.04.01", null, 120, 790_000],
    ["Мода", "54.04.01", null, 50, 790_000],
    ["Интерактивный дизайн", "54.04.01", null, 120, 600_000],
  ] as const)(
    "keeps programme funding and examination sources separate for %s",
    (title, code, budget, paid, tuition) => {
      const row = master(title, code);
      const designUrl =
        title === "Дизайн среды"
          ? "https://design.hse.ru/ma/program/environment"
          : "https://design.hse.ru/ma";
      expect(row.budgetPlaces.value).toBe(budget);
      expect(row.paidPlaces.value).toBe(paid);
      expect(row.paidPlaces.status).toBe("verified");
      expect(row.paidPlaces.sourceUrl).toBe(designUrl);
      expect(row.paidPlaces.year).toBe(2026);
      expect(row.exams.sourceUrl).toBe("https://ma.hse.ru/entrance");
      expect(row.faculty).toBe("Факультет креативных индустрий");
      expect(row.duration).toBe("2 года");
      expect(row.tuition.value).toBe(tuition);
      expect(row.tuition.sourceUrl).toBe(
        "https://www.hse.ru/pubs/share/direct/1159291409.pdf",
      );
      if (budget === null) expect(row.budgetPlaces.status).not.toBe("verified");
    },
  );

  it("retains full-time regulatory form for the programme marketed as online design", () => {
    const row = master("Интерактивный дизайн", "54.04.01");
    expect(row.form).toBe("Очная");
    const raw = snapshot.masterTuition.find(
      (entry) =>
        entry.title === row.title &&
        entry.code === row.code &&
        entry.campus === row.campus,
    )!;
    const proof = raw.fieldEvidence!.paid!;
    expect(proof.sourceYear).toBe(2026);
    expect(proof.sourceLocator).toMatchObject({
      sectionId: "online",
      exactText: "120 коммерческих мест",
      programmeIdentityLocator: {
        formHeading: "Очное обучение",
        publishedTitle: "Интерактивный дизайн (онлайн)",
      },
    });
    expect(proof.sourceLocator.yearAnchorExactText).toContain("2026");
    expect(row.paidPlaces.value).toBe(120);
    expect(row.paidPlaces.value).not.toBe(121);
  });

  it("uses each direction's places without combining international or other-code places", () => {
    const title = "Международный спортивный менеджмент, маркетинг и право";
    const management = master(title, "38.04.02");
    const law = master(title, "40.04.01");
    expect(management.paidPlaces.value).toBe(40);
    expect(law.paidPlaces.value).toBe(20);
    expect(management.budgetPlaces.value).toBeNull();
    expect(law.budgetPlaces.value).toBeNull();
    expect(management.paidPlaces.sourceSection).toContain("38.04.02");
    expect(law.paidPlaces.sourceSection).toContain("40.04.01");
    const analytics = "Аналитика данных для бизнеса и экономики";
    for (const code of ["38.04.01", "38.04.02"]) {
      const row = master(analytics, code, "Санкт-Петербург");
      expect(row.budgetPlaces.value).toBe(20);
      expect(row.paidPlaces.value).toBe(10);
      expect(row.paidPlaces.sourceSection).toContain(code);
    }
    const combined = hseMasterTuition.filter(
      (row) =>
        row.title === "Системный анализ и математические технологии" &&
        row.campus === "Москва",
    );
    expect(combined).toHaveLength(1);
    expect(combined[0].code).toBe("01.04.02 / 01.04.04");
    expect(combined[0].budgetPlaces.value).toBe(35);
  });

  it("preserves the remaining two examination gaps and six entirely unknown funding routes", () => {
    expect(hseMasterTuition).toHaveLength(204);
    const examGaps = hseMasterTuition.filter((row) => row.exams.value === null);
    expect(examGaps.map((row) => row.title).sort()).toEqual([
      "Технологии искусственного интеллекта в телекомуникациях",
      "Управление в креативных индсутриях",
    ]);
    for (const row of examGaps) {
      expect(row.exams.status).toBe("pending_review");
      expect(row.faculty).toBeNull();
      expect(row.duration).toBeNull();
    }
    const fundingGaps = hseMasterTuition.filter(
      (row) => row.budgetPlaces.value === null && row.paidPlaces.value === null,
    );
    expect(fundingGaps.map((row) => row.title).sort()).toEqual([
      "Исторические исследования",
      "Математика машинного обучения",
      "Обучение и оценивание как наука",
      "Системное программирование",
      "Технологии искусственного интеллекта в телекомуникациях",
      "Управление в креативных индсутриях",
    ]);
    expect(hseMasterTuition.filter((row) => row.faculty === null)).toHaveLength(
      6,
    );
    expect(
      hseMasterTuition.filter((row) => row.duration === null),
    ).toHaveLength(2);
    expect(
      hseMasterTuition.filter((row) => row.tuition.value === null),
    ).toHaveLength(0);
  });
});
