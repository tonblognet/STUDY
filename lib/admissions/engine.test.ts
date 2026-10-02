import { describe, expect, it } from "vitest";
import { programs, type Program } from "@/lib/data";
import { matchProgram } from "./matching";
import { additionalExamKey } from "./exams";
import { DEFAULT_ADMISSION_FILTERS, matchesAdmissionFilters } from "./filters";
import type { AdditionalExam, ScoreSet } from "./types";

const hse = programs.find((p) => p.slug === "hse-economics")!;
const profile: ScoreSet = {
  id: "test",
  name: "Test",
  scores: { Математика: 95, "Русский язык": 95, Информатика: 95 },
  individualAchievements: 0,
  updatedAt: "2026-09-22T00:00:00.000Z",
};
// Synthetic rules test the engine, and are never published as catalog facts.
const fact = (value: number) => ({
  ...hse.passingScoreValue,
  value,
  year: hse.trust.dataYear,
  status: "verified" as const,
});
const exam = (id: string): AdditionalExam => ({
  id,
  title: { ...hse.dviValue, value: id, status: "verified" },
  minimum: fact(50),
  maximum: fact(100),
});
const comparable: Program = {
  ...hse,
  passingScoreExamScale: 300,
  passingScoreValue: { ...fact(270), year: 2025 },
};

describe("layer 02 admission engine boundaries", () => {
  it("keeps fulfilled exam requirements and total without historical data", () => {
    const result = matchProgram(
      {
        ...hse,
        passingScoreValue: {
          ...hse.passingScoreValue,
          value: null,
          status: "not_published",
        },
      },
      profile,
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.consideredScore).toBe(285);
    expect(result.margin).toBeNull();
    expect(result.comparisonMissing.join()).toContain("проходной балл");
  });
  it("distinguishes failed minima from missing inputs", () => {
    expect(
      matchProgram(hse, {
        ...profile,
        scores: { ...profile.scores, Математика: 64 },
      }).eligibility,
    ).toBe("ineligible");
    expect(matchProgram(hse, { ...profile, scores: {} }).eligibility).toBe(
      "unknown",
    );
    expect(
      matchProgram(hse, {
        ...profile,
        scores: { ...profile.scores, Математика: 65 },
      }).eligibility,
    ).toBe("eligible");
  });
  it.each([-1, 101, 80.5, NaN, Infinity])(
    "rejects invalid exam and achievement input %s",
    (value) => {
      expect(
        matchProgram(hse, {
          ...profile,
          scores: { ...profile.scores, Математика: value },
        }).consideredScore,
      ).toBeNull();
      expect(
        matchProgram(hse, { ...profile, individualAchievements: value })
          .consideredScore,
      ).toBeNull();
    },
  );
  it("does not invent an achievements cap", () => {
    expect(
      matchProgram(hse, { ...profile, individualAchievements: 5 })
        .consideredScore,
    ).toBeNull();
    const result = matchProgram(
      { ...hse, individualAchievementsMax: fact(3) },
      { ...profile, individualAchievements: 10 },
    );
    expect(result.consideredScore).toBe(288);
    expect(result.reasons.join()).toContain("учтено 3 из 10");
  });
  it("rejects previous-year minima and unknown DVI absence", () => {
    const stale = structuredClone(hse);
    stale.examRequirements[0].minimum.year = 2025;
    expect(matchProgram(stale, profile).eligibility).toBe("unknown");
    expect(
      matchProgram(
        { ...hse, dviValue: { ...hse.dviValue, status: "pending_review" } },
        profile,
      ).eligibility,
    ).toBe("unknown");
  });
  it("solves overlapping alternatives globally without double counting", () => {
    const program = {
      ...hse,
      examRequirements: [
        {
          id: "one",
          subjects: ["Математика", "Информатика"],
          minimum: fact(50),
          required: true,
          label: "One",
        },
        {
          id: "two",
          subjects: ["Математика"],
          minimum: fact(50),
          required: true,
          label: "Two",
        },
        {
          id: "optional",
          subjects: ["История"],
          minimum: fact(50),
          required: false,
          label: "Optional",
        },
      ],
    };
    expect(
      matchProgram(program, {
        ...profile,
        scores: { Математика: 100, Информатика: 80 },
      }).consideredScore,
    ).toBe(180);
    expect(
      matchProgram(program, { ...profile, scores: { Математика: 100 } })
        .eligibility,
    ).toBe("unknown");
    expect(
      matchProgram(program, {
        ...profile,
        scores: { Математика: 100 },
      }).requirementsMissing.join(),
    ).toContain("Информатика");
    expect(
      matchProgram(program, {
        ...profile,
        scores: { Математика: 100, Информатика: 49 },
      }).eligibility,
    ).toBe("ineligible");
  });
  it("requires each creative exam and isolates results between programs", () => {
    const program = {
      ...hse,
      additionalExams: [exam("creative"), exam("professional")],
    };
    const scores = {
      [additionalExamKey(program, program.additionalExams[0])]: 80,
      [additionalExamKey(program, program.additionalExams[1])]: 70,
    };
    expect(
      matchProgram(program, { ...profile, additionalExamScores: scores })
        .consideredScore,
    ).toBe(435);
    expect(
      matchProgram(program, {
        ...profile,
        additionalExamScores: {
          ...scores,
          [additionalExamKey(program, program.additionalExams[1])]: 49,
        },
      }).eligibility,
    ).toBe("ineligible");
    expect(
      matchProgram(
        { ...program, slug: "other" },
        { ...profile, additionalExamScores: scores },
      ).eligibility,
    ).toBe("unknown");
    expect(
      matchProgram(program, { ...profile, dviScore: 100 }).eligibility,
    ).toBe("unknown");
  });
  it("does not use unverified DVI limits", () => {
    const extra = exam("creative");
    const program = {
      ...hse,
      additionalExams: [
        {
          ...extra,
          minimum: { ...extra.minimum, status: "pending_review" as const },
        },
      ],
    };
    expect(
      matchProgram(program, {
        ...profile,
        additionalExamScores: { [additionalExamKey(program, extra)]: 100 },
      }).eligibility,
    ).toBe("unknown");
  });
  it("compares only a verified prior-year cutoff on the same scale", () => {
    expect(matchProgram(comparable, profile).margin).toBe(15);
    expect(matchProgram(comparable, profile).category).toBe("high");
    expect(
      matchProgram({ ...comparable, passingScoreExamScale: 400 }, profile)
        .margin,
    ).toBeNull();
    expect(
      matchProgram({ ...comparable, passingScoreExamScale: undefined }, profile)
        .margin,
    ).toBeNull();
    expect(
      matchProgram(
        {
          ...comparable,
          passingScoreValue: { ...comparable.passingScoreValue, year: 2024 },
        },
        profile,
      ).margin,
    ).toBeNull();
    const conflicting = matchProgram(
      {
        ...comparable,
        passingScoreValue: {
          ...comparable.passingScoreValue,
          status: "conflicting_sources",
        },
      },
      profile,
    );
    expect(conflicting.passingScore).toBeNull();
    expect(conflicting.consideredScore).toBe(285);
  });
  it.each([
    [270, "competitive"],
    [269, "ambitious"],
    [285, "high"],
  ] as const)("compares score %s at a category boundary", (score, category) => {
    expect(
      matchProgram(comparable, {
        ...profile,
        scores: {
          Математика: 95,
          "Русский язык": 95,
          Информатика: score - 190,
        },
      }).category,
    ).toBe(category);
  });
});

describe("strict admission filters", () => {
  it("includes unknown values by default but excludes them from positive filters", () => {
    const unknown = {
      ...hse,
      tuitionValue: { ...fact(1), status: "pending_review" as const },
      hostel: { ...hse.hostel, value: true, status: "pending_review" as const },
    };
    expect(matchesAdmissionFilters(unknown, DEFAULT_ADMISSION_FILTERS)).toBe(
      true,
    );
    expect(
      matchesAdmissionFilters(unknown, {
        ...DEFAULT_ADMISSION_FILTERS,
        maxPrice: "100000",
      }),
    ).toBe(false);
    expect(
      matchesAdmissionFilters(unknown, {
        ...DEFAULT_ADMISSION_FILTERS,
        hostel: true,
      }),
    ).toBe(false);
    expect(
      matchesAdmissionFilters(hse, {
        ...DEFAULT_ADMISSION_FILTERS,
        accreditation: "verified",
      }),
    ).toBe(false);
    expect(
      matchesAdmissionFilters(hse, {
        ...DEFAULT_ADMISSION_FILTERS,
        accreditation: "unknown",
      }),
    ).toBe(true);
  });
  it("combines filters and distinguishes zero, unknown, stale and confirmed places", () => {
    const program = {
      ...hse,
      paidPlacesValue: fact(20),
      tuitionValue: fact(100000),
    };
    const filters = {
      ...DEFAULT_ADMISSION_FILTERS,
      query: "38.03.01",
      university: "hse",
      form: "Очная",
      funding: "paid" as const,
      maxPrice: "100000",
    };
    expect(matchesAdmissionFilters(program, filters)).toBe(true);
    for (const places of [
      fact(0),
      { ...fact(20), year: 2025 },
      { ...fact(20), status: "pending_review" as const },
    ])
      expect(
        matchesAdmissionFilters(
          { ...program, paidPlacesValue: places },
          filters,
        ),
      ).toBe(false);
    expect(
      matchesAdmissionFilters(program, { ...filters, maxPrice: "99999" }),
    ).toBe(false);
  });
});
