import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SavedProgramActions } from "./saved-program-actions";

const state = vi.hoisted(() => ({
  favoriteIds: [] as string[],
  comparisonIds: [] as string[],
  toggleFavorite: vi.fn(),
  toggleComparison: vi.fn(),
  storageMode: "account",
  error: null,
}));
vi.mock("./user-state-provider", () => ({ useUserState: () => state }));

describe("comparison capacity", () => {
  beforeEach(() => {
    state.favoriteIds = [];
    state.comparisonIds = Array.from({ length: 20 }, (_, i) => `program-${i}`);
  });

  it("explains why another comparison cannot be added without blocking favorites", () => {
    const html = renderToStaticMarkup(<SavedProgramActions id="new-program" />);
    const buttons = html.match(/<button[^>]*>/g)!;
    expect(buttons[0]).not.toContain("disabled");
    expect(buttons[1]).toContain('disabled=""');
    expect(html).toContain("Лимит сравнения: 20");
    expect(html).toContain("Удалите одну, чтобы добавить новую");
  });

  it("keeps removal available at the capacity limit", () => {
    const html = renderToStaticMarkup(<SavedProgramActions id="program-0" />);
    const comparison = html.match(/<button[^>]*>/g)![1];
    expect(comparison).not.toContain("disabled");
    expect(comparison).toContain('aria-label="Удалить из сравнения"');
  });

  it("allows adding again after removing a program and labels compact controls", () => {
    const full = renderToStaticMarkup(
      <SavedProgramActions id="new-program" compact />,
    );
    expect(full).toContain(
      'aria-label="Сравнение заполнено: максимум 20 программ"',
    );
    state.comparisonIds.pop();
    const available = renderToStaticMarkup(
      <SavedProgramActions id="new-program" compact />,
    );
    expect(available.match(/<button[^>]*>/g)![1]).not.toContain("disabled");
    expect(available).toContain('aria-label="Добавить в сравнение"');
  });
});
