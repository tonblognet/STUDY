import { describe, expect, it } from "vitest";
import { calculateCompleteness } from "./completeness";
import { matchProgram } from "./matching";
import { programs } from "../data";
import type { ScoreSet } from "./types";

const hse = programs.find((program) => program.slug === "hse-economics")!;
const profile = (
  scores: Record<string, number>,
  extra: Partial<ScoreSet> = {},
): ScoreSet => ({
  id: "test",
  name: "Тест",
  scores,
  individualAchievements: 0,
  updatedAt: "2026-08-05T00:00:00.000Z",
  ...extra,
});

describe("детерминированный подбор", () => {
  it("выбирает лучший допустимый альтернативный предмет", () => {
    const result = matchProgram(
      hse,
      profile({
        Математика: 95,
        "Русский язык": 95,
        Обществознание: 70,
        Информатика: 95,
      }),
    );
    expect(result.consideredScore).toBe(285);
    expect(result.reasons.join(" ")).toContain("Информатика");
  });

  it("не оценивает программу при балле ниже официального минимума", () => {
    const result = matchProgram(
      hse,
      profile({ Математика: 64, "Русский язык": 100, Информатика: 100 }),
    );
    expect(result.category).toBe("insufficient");
    expect(result.missing.join(" ")).toContain("минимум 65");
  });

  it("не даёт уверенную категорию без проходного балла", () => {
    const mipt = programs.find(
      (program) => program.slug === "mipt-applied-math",
    )!;
    const result = matchProgram(
      mipt,
      profile({ Математика: 100, "Русский язык": 100, Информатика: 100 }),
    );
    expect(result.category).toBe("insufficient");
    expect(result.missing.join(" ")).toContain("проходной балл");
  });

  it("требует ДВИ и учитывает его отдельно", () => {
    const msu = {
      ...hse,
      dvi: "Математика",
      dviValue: {
        ...hse.dviValue,
        value: "Математика",
        status: "verified" as const,
      },
      dviMax: { ...hse.dviMax, value: 100, status: "verified" as const },
      dviMinimum: { ...hse.dviMax, value: 50, status: "verified" as const },
    };
    const without = matchProgram(
      msu,
      profile({ Математика: 100, "Русский язык": 100, Информатика: 100 }),
    );
    const withDvi = matchProgram(
      msu,
      profile(
        { Математика: 100, "Русский язык": 100, Информатика: 100 },
        { dviScore: 80, dviProgramSlug: msu.slug },
      ),
    );
    expect(without.category).toBe("insufficient");
    expect(withDvi.consideredScore).toBe(380);
  });

  it("отказывается от уверенной оценки для устаревшего ориентира", () => {
    const stale = {
      ...hse,
      passingScoreValue: {
        ...hse.passingScoreValue,
        status: "outdated" as const,
      },
    };
    expect(
      matchProgram(
        stale,
        profile({ Математика: 100, "Русский язык": 100, Информатика: 100 }),
      ).category,
    ).toBe("insufficient");
  });
});

describe("полнота карточки", () => {
  it("считает результат по весам и возвращает список пробелов", () => {
    const result = calculateCompleteness(hse);
    expect(result.total).toBe(100);
    expect(result.percent).toBeGreaterThan(50);
    expect(result.missing).toContain("квоты");
  });

  it("не считает pending_review заполненным полем", () => {
    const partial = {
      ...hse,
      tuitionValue: { ...hse.tuitionValue, status: "pending_review" as const },
    };
    expect(calculateCompleteness(partial).percent).toBeLessThan(
      calculateCompleteness(hse).percent,
    );
  });
});

describe("очные конкурсы МЭИ и РУДН 2026", () => {
  const ids = ["mpei-applied-informatics", "rudn-ami"];
  const required = { Математика: 40, "Русский язык": 40 };

  it.each(ids)("применяет отдельные минимумы альтернатив в %s", (id) => {
    const program = programs.find((item) => item.id === id)!;
    const physics = matchProgram(
      program,
      profile({ ...required, Физика: 41 }, { individualAchievements: 10 }),
    );
    expect(physics.eligibility).toBe("eligible");
    expect(physics.consideredScore).toBe(131);
    const informatics = matchProgram(
      program,
      profile({ ...required, Информатика: 45 }),
    );
    expect(informatics.eligibility).toBe("ineligible");
    expect(informatics.blockers).toContain("Информатика: 45, минимум 46");
    expect(
      matchProgram(program, profile({ ...required, Информатика: 46 }))
        .consideredScore,
    ).toBe(126);
    expect(program.minScore).toBeNull();
  });

  it("сравнивает балл МЭИ с бюджетным ориентиром 2025 на сопоставимой шкале", () => {
    const program = programs.find((item) => item.id === ids[0])!;
    const result = matchProgram(
      program,
      profile({ Математика: 90, "Русский язык": 90, Информатика: 90 }),
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.passingScore).toBe(261);
    expect(result.margin).toBe(9);
    expect(program.passingScoreValue.year).toBe(2025);
    expect(program.quotas.general.value).toBeNull();
  });

  it("оценивает минимумы РУДН без сравнения с многопрофильным конкурсом 2025", () => {
    const program = programs.find((item) => item.id === ids[1])!;
    const result = matchProgram(
      program,
      profile({ Математика: 90, "Русский язык": 90, Информатика: 90 }),
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.consideredScore).toBe(270);
    expect(result.margin).toBeNull();
    expect(result.passingScore).toBeNull();
    expect(program.passingHistory).toHaveLength(0);
    expect(program.quotas.general).toMatchObject({
      status: "conflicting_sources",
      value: null,
    });
    expect(program.paidPlacesValue.value).toBe(17);
    expect(program.tuitionValue.value).toBe(285_000);
  });

  it("оставляет пять неполных конкурсов в редакционной очереди", () => {
    for (const id of [
      ...ids,
      "mipt-ami",
      "rea-international-law",
      "mephi-nuclear",
    ]) {
      const program = programs.find((item) => item.id === id)!;
      expect(program.trust.status).toBe("pending_review");
      expect(program.verified).toBe(false);
    }
  });
});
