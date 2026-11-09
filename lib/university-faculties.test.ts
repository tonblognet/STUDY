import { describe, expect, it } from "vitest";
import {
  filterUniversityFaculties,
  type FacultyListItem,
} from "./university-faculties";

const rows: FacultyListItem[] = [
  {
    name: "Факультет   учёта и финансов",
    url: null,
    sourceUrl: "https://university.example/structure",
    checkedAt: "2026-10-09T21:10:00Z",
  },
  {
    name: "Инженерная школа",
    url: "https://university.example/engineering",
    sourceUrl: "https://university.example/structure",
    checkedAt: "2026-10-09T21:10:00Z",
  },
];

describe("faculty search", () => {
  it("finds official names across case, ё and spacing without changing the evidence", () => {
    expect(filterUniversityFaculties(rows, "  УЧЕТА  и   ФИНАНСОВ ")).toEqual([
      rows[0],
    ]);
    expect(filterUniversityFaculties(rows, "школа")).toEqual([rows[1]]);
    expect(rows[0].name).toBe("Факультет   учёта и финансов");
  });
  it("returns an empty result and clearing restores every collected unit", () => {
    expect(
      filterUniversityFaculties(rows, "несуществующее подразделение"),
    ).toEqual([]);
    expect(filterUniversityFaculties(rows, "")).toEqual(rows);
  });
});
