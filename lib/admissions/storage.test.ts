import { afterEach, describe, expect, it, vi } from "vitest";
import { readScoreSets, readStoredList, writeScoreSets, writeStoredList } from "./storage";

function fakeWindow() {
  const values = new Map<string, string>();
  return { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, dispatchEvent: vi.fn() };
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
      { id: "one", name: "ИТ", scores: { "Информатика": 90 }, individualAchievements: 2, updatedAt: "2026-08-05" },
      { id: "two", name: "Экономика", scores: { "Обществознание": 88 }, individualAchievements: 0, updatedAt: "2026-08-05" },
    ]);
    expect(readScoreSets()).toHaveLength(2);
  });
});
