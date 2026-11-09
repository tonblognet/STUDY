import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UniversityFaculties } from "./university-faculties";

describe("official faculty directory", () => {
  it("renders the first page with sources, search and a count for every collected unit", () => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      name: `Факультет ${index + 1}`,
      url: index === 0 ? "https://university.example/faculty" : null,
      sourceUrl: "https://university.example/structure",
      checkedAt: "2026-10-09T21:10:00Z",
    }));
    const html = renderToStaticMarkup(<UniversityFaculties rows={rows} />);
    expect(html).toContain("Поиск по факультетам и институтам");
    expect(html).toContain("Найдено подразделений: 18 из 18");
    expect(html).toContain("Факультет 12</strong>");
    expect(html).not.toContain("Факультет 13");
    expect(html).toContain("Показать ещё 6 подразделений");
    expect(html).toContain('href="https://university.example/structure"');
    expect(html).toContain("наличие подразделения не подтверждает набор");
  });
});
