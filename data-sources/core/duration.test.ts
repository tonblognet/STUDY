import { describe, expect, it } from "vitest";
import { programDurationMonths } from "./duration";
import { mguFact } from "@/lib/mgu-admissions";

describe("импорт продолжительности обучения", () => {
  it.each([
    ["4 года", 48],
    ["6 лет", 72],
    ["5,5 лет", 66],
    ["5 лет 6 месяцев", 66],
    ["Срок уточняется", null],
    ["", null],
    ["0 лет", null],
    ["99 лет", null],
  ])("%s → %s", (duration, expected) => {
    expect(programDurationMonths({ duration })).toBe(expected);
  });
  it("не импортирует число без подтверждённого источника", () => {
    expect(
      programDurationMonths({
        duration: "4 года",
        durationValue: mguFact<string>(
          null,
          "https://cpk.msu.ru/pk",
          "Срок неизвестен",
        ),
      }),
    ).toBeNull();
  });
});
