import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogClient } from "./catalog-client";
import { ProgramDecisionPage } from "./program-decision-page";
import { HomeDataOverview } from "./home-data-overview";
import { UserStateProvider } from "./user-state-provider";
import { AccountSavedPrograms } from "./account-saved-programs";
import { AdditionalExamInputs } from "./additional-exam-inputs";
import { programs, universities } from "../lib/data";

const renderWithState = (node: React.ReactNode) =>
  renderToStaticMarkup(<UserStateProvider>{node}</UserStateProvider>);

describe("ключевые интерфейсы", () => {
  it("различает ДВИ одноимённых программ по факультету и ссылке", () => {
    const economics = programs.filter(
      (p) => p.universitySlug === "mgu" && p.code === "38.03.01",
    );
    expect(economics.length).toBeGreaterThan(1);
    const html = renderToStaticMarkup(
      <AdditionalExamInputs
        programs={economics}
        profile={{
          id: "test",
          name: "Test",
          scores: {},
          individualAchievements: 0,
          updatedAt: "2026-10-02T00:00:00.000Z",
        }}
        onChange={() => {}}
      />,
    );
    for (const program of economics) {
      expect(program.faculty).toBeTruthy();
      expect(html).toContain(program.faculty);
      expect(html).toContain(`href="/programs/${program.slug}"`);
    }
  });
  it("каталог содержит поиск, фильтры и табличный список", () => {
    const html = renderWithState(
      <CatalogClient universities={universities} items={programs} />,
    );
    expect(html).toContain("Название программы, направление или вуз");
    expect(html).toContain("Предметы ЕГЭ");
    expect(html).toContain("Программа / вуз");
    expect(html).toContain(`Найдено ${programs.length} программ`);
    expect(html).toContain("Без ограничения балла");
    expect(html.match(/class="program-row"/g)).toHaveLength(24);
    expect(html).toContain("Показать ещё");
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
