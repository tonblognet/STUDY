import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import evidence from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-results-all.json";
import {
  HseScoreArchive,
  type HseScoreArchiveRecord,
} from "./hse-score-archive";

const records = evidence.records as HseScoreArchiveRecord[];

describe("HSE official score archive", () => {
  it("offers all campuses and years while limiting the initial page to 12 results", () => {
    const html = renderToStaticMarkup(<HseScoreArchive />);
    expect(html.match(/<article /g)).toHaveLength(12);
    expect(html).toContain("Найдено конкурсов 140 из 140");
    expect(html).toContain("Показать ещё 12 конкурсов");
    expect(html).toContain('id="hse-score-query"');
    expect(html).toContain('id="hse-score-campus"');
    expect(html).toContain('id="hse-score-year"');
    for (const campus of [
      "Москва",
      "Санкт-Петербург",
      "Нижний Новгород",
      "Пермь",
    ]) {
      expect(html).toContain(`<option value="${campus}">`);
    }
    expect(html).toContain('<option value="2025">');
    expect(html).toContain('<option value="2026">');
  });

  it("preserves a shared historical result with both codes and its official source", () => {
    const shared = records.find(
      (row) =>
        row.campus === "Пермь" && row.year === 2025 && row.codes?.length === 2,
    )!;
    const html = renderToStaticMarkup(<HseScoreArchive rows={[shared]} />);
    expect(html.match(/<article /g)).toHaveLength(1);
    expect(html).toContain("38.03.01 / 38.03.02");
    expect(html).toContain("Результат относится к общей группе");
    expect(html).toContain(
      'href="https://perm.hse.ru/data/2026/09/28/240684403/',
    );
    expect(html).toContain("Страница 7");
    expect(html).toContain("Не опубликован");
  });

  it("retains priority admission notes and an unresolved score scale", () => {
    const pmi = records.find(
      (row) =>
        row.campus === "Москва" &&
        row.year === 2026 &&
        row.title === "Прикладная математика и информатика",
    )!;
    const pending = records.find(
      (row) => row.paid.status === "pending_review",
    )!;
    const html = renderToStaticMarkup(
      <HseScoreArchive rows={[pmi, pending]} />,
    );
    expect(html).toContain("Без числового проходного");
    expect(html).toContain("были заняты поступившими в приоритетном порядке");
    expect(html).toContain("Требует сверки");
    expect(html).toContain("Шкала баллов и основания приёма требуют сверки");
    expect(html).toContain(`В источнике «${pending.paid.raw}».`);
    expect(html).not.toMatch(/<strong[^>]*>310<\/strong>/);
    expect(html).not.toMatch(
      new RegExp(`<strong[^>]*>${pending.paid.raw}<\\/strong>`),
    );
  });

  it("shows conflicting faculty values beside the central historical result", () => {
    const drip = records.find(
      (row) =>
        row.campus === "Москва" &&
        row.year === 2025 &&
        row.title.startsWith("Дизайн и разработка информационных продуктов"),
    )!;
    const html = renderToStaticMarkup(<HseScoreArchive rows={[drip]} />);
    expect(html).toContain("Расхождение официальных источников");
    expect(html).toContain("240 баллов");
    expect(html).toContain("комиссии — 241");
    expect(html).toContain('href="https://ba.hse.ru/result2025"');
    expect(html).toContain('href="https://cs.hse.ru/abitur/ba"');
  });

  it("publishes only official source links and excludes local filesystem paths", () => {
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toMatch(/localFile|visualEvidence|[A-Z]:[\\/]/);
    for (const row of records) {
      expect(row.programUrls.length).toBeGreaterThan(0);
      for (const url of row.programUrls) {
        expect(new URL(url).hostname).toMatch(/(^|\.)hse\.ru$/);
      }
    }
    for (const source of Object.values(evidence.sources)) {
      expect(new URL(source.url).hostname).toMatch(/(^|\.)hse\.ru$/);
    }
    expect(new Set(records.map((row) => row.id)).size).toBe(records.length);
  });
});
