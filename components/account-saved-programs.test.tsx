import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSavedPrograms } from "./account-saved-programs";
import { programs } from "../lib/data";

const state = vi.hoisted(() => ({
  favoriteIds: [] as string[],
  comparisonIds: [] as string[],
  storageMode: "account",
  error: null as string | null,
  toggleFavorite: vi.fn(),
  removeFromComparison: vi.fn(),
}));
vi.mock("./user-state-provider", () => ({ useUserState: () => state }));

describe("saved programs in the account", () => {
  beforeEach(() => {
    state.favoriteIds = [];
    state.comparisonIds = [];
    state.storageMode = "account";
    state.error = null;
  });

  it("keeps unavailable saved references visible and removable in both lists", () => {
    state.favoriteIds = [programs[0].id, "removed-favorite"];
    state.comparisonIds = ["removed-comparison"];
    const html = renderToStaticMarkup(
      <AccountSavedPrograms programs={programs} />,
    );
    expect(html).toContain(`href="/programs/${programs[0].slug}"`);
    expect(html).toContain("Сохранённый ключ: removed-favorite");
    expect(html).toContain("Сохранённый ключ: removed-comparison");
    expect(html).toContain(
      'aria-label="Удалить removed-favorite из избранного"',
    );
    expect(html).toContain(
      'aria-label="Удалить removed-comparison из сравнения"',
    );
    expect(html).not.toContain('href="/programs/removed-');
    expect(html).toContain("<h3>Избранное</h3><b>2</b>");
    expect(html).not.toContain('disabled=""');
  });

  it("distinguishes an unavailable store from an empty personal list", () => {
    state.storageMode = "unavailable";
    const html = renderToStaticMarkup(
      <AccountSavedPrograms programs={programs} />,
    );
    expect(html).toContain("Хранилище недоступно");
    expect(html).toContain("Не удалось получить избранное");
    expect(html).not.toContain("Добавьте программы из каталога");
    expect(html).not.toContain("Загрузка…");
  });

  it("disables removal while a synchronization conflict needs resolution", () => {
    state.favoriteIds = ["removed-favorite"];
    state.error = "Данные изменены в другой вкладке";
    const html = renderToStaticMarkup(
      <AccountSavedPrograms programs={programs} />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Удалить removed-favorite из избранного"/,
    );
  });
});
