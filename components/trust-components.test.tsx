import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogClient } from "./catalog-client";
import { ProgramDecisionPage } from "./program-decision-page";
import { HomeDataOverview } from "./home-data-overview";
import { programs } from "../lib/data";

describe("ключевые интерфейсы", () => {
  it("каталог содержит поиск, фильтры и оба режима", () => {
    const html = renderToStaticMarkup(<CatalogClient items={programs}/>);
    expect(html).toContain("Поиск по каталогу");
    expect(html).toContain("Сетка");
    expect(html).toContain("Таблица");
  });

  it("страница программы отвечает на три вопроса и показывает источник", () => {
    const html = renderToStaticMarkup(<ProgramDecisionPage program={programs[0]}/>);
    expect(html).toContain("Подхожу ли я?");
    expect(html).toContain("Что сдавать?");
    expect(html).toContain("Сколько стоит?");
    expect(html).toContain("Откуда взяты данные");
    expect(html).toContain("Сообщить об ошибке");
  });

  it("интерактивные поля имеют подписи, а таблица — заголовки", () => {
    const html = renderToStaticMarkup(<CatalogClient items={programs}/>);
    expect(html).toMatch(/<label[^>]*>Предмет ЕГЭ/);
    expect(html).toMatch(/aria-label="Поиск по каталогу"/);
  });

  it("главная показывает вычисленную полноту без выдуманных показателей", () => {
    const html = renderToStaticMarkup(<HomeDataOverview programs={programs}/>);
    expect(html).toContain("Качество текущего набора");
    expect(html).toContain(`${programs[0].trust.completeness}%`);
    expect(html).toContain("Неподтверждённые поля не увеличивают показатель");
  });
});
