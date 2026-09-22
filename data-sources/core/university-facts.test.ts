import { describe, expect, it } from "vitest";
import { universities } from "../../lib/data";
import {
  universityFactProfiles,
  universitySourcedFields,
} from "../../lib/university-facts";
import { validateUniversityFactProfile } from "./university-fact-validation";

describe("source-aware факты университетов", () => {
  it("создаёт один профиль для каждого вуза каталога", () => {
    expect(universityFactProfiles).toHaveLength(universities.length);
    expect(
      universityFactProfiles.map(({ universitySlug }) => universitySlug).sort(),
    ).toEqual(universities.map(({ slug }) => slug).sort());
  });

  it("хранит происхождение всех чувствительных фактов", () => {
    for (const profile of universityFactProfiles) {
      const fields = universitySourcedFields(profile);
      expect(fields.map(([key]) => key)).toEqual(
        expect.arrayContaining([
          "website",
          "logo_url",
          "address",
          "dormitory_count",
          "military_center",
        ]),
      );
      for (const [, field] of fields) {
        expect(field.sourceUrl).toMatch(/^https?:\/\//);
        expect(field.sourceKind).toMatch(/^(html|pdf)$/);
        expect(field.checkedAt).toBeTruthy();
        expect(field.checkedBy).toBeTruthy();
        if (field.status === "verified") expect(field.value).not.toBeNull();
      }
    }
  });

  it("не превращает отсутствие подтверждения ВУЦ или общежития в false и 0", () => {
    const msal = universityFactProfiles.find(
      ({ universitySlug }) => universitySlug === "msal",
    )!;
    expect(msal.facts.militaryCenter.value).toBeNull();
    expect(msal.facts.militaryCenter.status).toBe("pending_review");
    expect(msal.facts.dormitoryCount.value).toBeNull();
    expect(msal.facts.dormitoryCount.status).toBe("pending_review");
  });

  it("подтверждает только факты с отдельной официальной опорой", () => {
    const bmstu = universityFactProfiles.find(
      ({ universitySlug }) => universitySlug === "bmstu",
    )!;
    expect(bmstu.facts.address.status).toBe("verified");
    expect(bmstu.facts.address.sourceUrl).toBe("https://mil.bmstu.ru/");
    expect(bmstu.facts.militaryCenter.value).toBe(true);
    expect(bmstu.facts.militaryCenter.status).toBe("verified");

    const sechenov = universityFactProfiles.find(
      ({ universitySlug }) => universitySlug === "sechenov",
    )!;
    expect(sechenov.facts.address.value).toContain("Трубецкая");
    expect(sechenov.facts.logoUrl.sourceUrl).toContain("ofitsialnyy-logotip");
  });

  it("валидирует официальный домен и согласованность статуса", () => {
    for (const profile of universityFactProfiles) {
      expect(validateUniversityFactProfile(profile)).toEqual({
        errors: [],
        warnings: expect.any(Array),
      });
    }

    const profile = structuredClone(universityFactProfiles[0]);
    profile.facts.militaryCenter = {
      ...profile.facts.militaryCenter,
      value: null,
      status: "verified",
      sourceUrl: "https://example.com/not-official",
    };
    const result = validateUniversityFactProfile(profile);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("неофициальный URL"),
        expect.stringContaining("null не может быть verified"),
      ]),
    );
  });
});
