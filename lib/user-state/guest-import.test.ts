import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readLocalUserState,
  STORAGE_KEYS,
  writeLocalUserState,
} from "@/lib/admissions/storage";
import type { ScoreSet } from "@/lib/admissions/types";
import { getUnimportedGuestState } from "./guest-import";
import { mergeUserStates } from "./merge";
import { EMPTY_USER_STATE, type UserState } from "./types";

const profile: ScoreSet = {
  id: "main",
  name: "Основной",
  scores: { Математика: 90, "Русский язык": 85 },
  individualAchievements: 5,
  dviScore: 80,
  dviProgramSlug: "creative",
  additionalExamScores: { "creative:drawing": 75 },
  updatedAt: "2026-10-28T00:00:00.000Z",
};

function state(overrides: Partial<UserState> = {}): UserState {
  return { favoriteIds: [], comparisonIds: [], scoreSets: [], ...overrides };
}

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    },
    dispatchEvent: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("guest import acknowledgement", () => {
  it("reports complete confirmation and preserves the entire local copy", () => {
    const guest = state({
      favoriteIds: ["favorite"],
      comparisonIds: ["compared"],
      scoreSets: [profile],
    });
    writeLocalUserState(guest);
    const confirmed = structuredClone(guest);
    confirmed.scoreSets[0].scores = { "Русский язык": 85, Математика: 90 };
    vi.mocked(window.localStorage.setItem).mockClear();
    expect(getUnimportedGuestState(guest, confirmed)).toEqual(EMPTY_USER_STATE);
    expect(readLocalUserState()).toEqual(guest);
    for (const key of [
      STORAGE_KEYS.favorites,
      STORAGE_KEYS.comparison,
      STORAGE_KEYS.scoreSets,
    ])
      expect(values.has(key)).toBe(true);
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it("keeps guest values omitted by list and profile limits", () => {
    const server = state({
      favoriteIds: Array.from({ length: 200 }, (_, i) => `favorite-${i}`),
      comparisonIds: Array.from({ length: 20 }, (_, i) => `compared-${i}`),
      scoreSets: Array.from({ length: 8 }, (_, i) => ({
        ...profile,
        id: `server-${i}`,
        updatedAt: "2026-10-28T01:00:00.000Z",
      })),
    });
    const guest = state({
      favoriteIds: ["guest-favorite"],
      comparisonIds: ["guest-compared"],
      scoreSets: [profile],
    });
    writeLocalUserState(guest);
    expect(
      getUnimportedGuestState(guest, mergeUserStates(server, guest)),
    ).toEqual(guest);
    expect(readLocalUserState()).toEqual(guest);
  });

  it("reports unpublished references without changing any local value", () => {
    const guest = state({
      favoriteIds: ["published", "unpublished-favorite"],
      comparisonIds: ["unpublished-comparison"],
      scoreSets: [profile],
    });
    writeLocalUserState(guest);
    const remaining = state({
      favoriteIds: ["unpublished-favorite"],
      comparisonIds: ["unpublished-comparison"],
    });
    expect(
      getUnimportedGuestState(
        guest,
        state({ favoriteIds: ["published"], scoreSets: [profile] }),
      ),
    ).toEqual(remaining);
    expect(readLocalUserState()).toEqual(guest);
  });

  it("never writes when another tab changes storage between acknowledgement reads", () => {
    const guest = state({ favoriteIds: ["original"], scoreSets: [profile] });
    writeLocalUserState(guest);
    const changed = state({
      favoriteIds: ["original", "new-from-other-tab"],
      scoreSets: [{ ...profile, scores: { Математика: 95 } }],
    });
    vi.mocked(window.localStorage.setItem).mockClear();
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
      const value = values.get(key) ?? null;
      if (key === STORAGE_KEYS.favorites) {
        // Another tab writes after favorites were read, before scores are read.
        values.set(STORAGE_KEYS.favorites, JSON.stringify(changed.favoriteIds));
        values.set(STORAGE_KEYS.scoreSets, JSON.stringify(changed.scoreSets));
      }
      return value;
    });
    expect(getUnimportedGuestState(guest, guest)).toEqual(EMPTY_USER_STATE);
    const observed = readLocalUserState();
    expect(observed.favoriteIds).toEqual(guest.favoriteIds);
    expect(observed.scoreSets).toEqual(changed.scoreSets);
    expect(JSON.parse(values.get(STORAGE_KEYS.favorites)!)).toEqual(
      changed.favoriteIds,
    );
    expect(JSON.parse(values.get(STORAGE_KEYS.scoreSets)!)).toEqual(
      changed.scoreSets,
    );
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    { updatedAt: "2026-10-28T01:00:00.000Z" },
    { name: "Другой набор" },
    { scores: { Математика: 99, "Русский язык": 85 } },
    { individualAchievements: 7 },
    { dviScore: 90 },
    { dviProgramSlug: "another-program" },
    { additionalExamScores: { "creative:drawing": 99 } },
  ])("keeps a guest profile if the saved version differs: %j", (change) => {
    const guest = state({ scoreSets: [profile] });
    writeLocalUserState(guest);
    expect(
      getUnimportedGuestState(
        guest,
        state({ scoreSets: [{ ...profile, ...change }] }),
      ),
    ).toEqual(guest);
    expect(readLocalUserState()).toEqual(guest);
  });

  it("does not mistake the same program in another list for confirmation", () => {
    const guest = state({
      favoriteIds: ["favorite"],
      comparisonIds: ["compared"],
    });
    writeLocalUserState(guest);
    expect(
      getUnimportedGuestState(
        guest,
        state({ favoriteIds: ["compared"], comparisonIds: ["favorite"] }),
      ),
    ).toEqual(guest);
  });
});
