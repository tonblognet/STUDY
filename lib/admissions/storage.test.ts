import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalUserState,
  readLocalUserState,
  readScoreSets,
  readStoredList,
  writeLocalUserState,
  writeScoreSets,
  writeStoredList,
} from "./storage";

function fakeWindow() {
  const values = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    dispatchEvent: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("локальные сохранения", () => {
  it("сохраняет список без дублей", () => {
    vi.stubGlobal("window", fakeWindow());
    writeStoredList("favorites", ["a", "a", "b"]);
    expect(readStoredList("favorites")).toEqual(["a", "b"]);
  });

  it("сохраняет несколько наборов ЕГЭ", () => {
    vi.stubGlobal("window", fakeWindow());
    writeScoreSets([
      {
        id: "one",
        name: "ИТ",
        scores: { Информатика: 90 },
        individualAchievements: 2,
        updatedAt: "2026-08-05",
      },
      {
        id: "two",
        name: "Экономика",
        scores: { Обществознание: 88 },
        individualAchievements: 0,
        updatedAt: "2026-08-05",
      },
    ]);
    expect(readScoreSets()).toHaveLength(2);
  });

  it("сохраняет и очищает локальную резервную копию целиком", () => {
    vi.stubGlobal("window", fakeWindow());
    writeLocalUserState({
      favoriteIds: ["hse"],
      comparisonIds: ["mipt"],
      scoreSets: [],
    });
    expect(readLocalUserState()).toEqual({
      favoriteIds: ["hse"],
      comparisonIds: ["mipt"],
      scoreSets: [],
    });
    clearLocalUserState();
    expect(readLocalUserState()).toEqual({
      favoriteIds: [],
      comparisonIds: [],
      scoreSets: [],
    });
  });
});
