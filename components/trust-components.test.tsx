import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogClient } from "./catalog-client";
import { ProgramDecisionPage } from "./program-decision-page";
import { HomeDataOverview } from "./home-data-overview";
import { UserStateProvider } from "./user-state-provider";
import { AccountSavedPrograms } from "./account-saved-programs";
import { programs, universities } from "../lib/data";

const renderWithState = (node: React.ReactNode) =>
  renderToStaticMarkup(<UserStateProvider>{node}</UserStateProvider>);

describe("ключевые интерфейсы", () => {
  it("каталог содержит поиск, фильтры и табличный список", () => {
    const html = renderWithState(
      <CatalogClient universities={universities} items={programs} />,
    );
    expect(html).toContain("Название программы, направление или вуз");
    expect(html).toContain("Предметы ЕГЭ");
    expect(html).toContain("Программа / вуз");
  });

  it("страница программы отвечает на три вопроса и показывает источник", () => {
    const html = renderWithState(<ProgramDecisionPage program={programs[0]} />);
    expect(html).toContain("Подхожу ли я?");
    expect(html).toContain("Что сдавать?");
    expect(html).toContain("Сколько стоит?");
    expect(html).toContain("Откуда взяты данные");
    expect(html).toContain("Сообщить об ошибке");
  });

  it("интерактивные поля имеют подписи, а таблица — заголовки", () => {
    const html = renderWithState(
      <CatalogClient universities={universities} items={programs} />,
    );
    expect(html).toMatch(/<legend>Предметы ЕГЭ<\/legend>/);
    expect(html).toMatch(/<span class="sr-only">Поиск программ<\/span>/);
  });

  it("главная показывает вычисленную полноту без выдуманных показателей", () => {
    const html = renderToStaticMarkup(<HomeDataOverview programs={programs} />);
    expect(html).toContain("Качество текущего набора");
    expect(html).toContain(`${programs[0].trust.completeness}%`);
    expect(html).toContain("Неподтверждённые поля не увеличивают показатель");
  });

  it("личный кабинет показывает избранное и сравнение как отдельные списки", () => {
    const html = renderWithState(<AccountSavedPrograms programs={programs} />);
    expect(html).toContain("Сохранённые программы");
    expect(html).toContain("Избранное");
    expect(html).toContain("Сравнение");
  });
});
