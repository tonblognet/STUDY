import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SupportInbox, SupportTicketMeta } from "./support-inbox";
import type { SupportTicketView } from "@/lib/support/policy";

const ticket: SupportTicketView = {
  id: "fixture",
  subject: "Вопрос",
  category: "OTHER",
  status: "OPEN",
  priority: "NORMAL",
  version: 1,
  createdAt: "2026-11-10T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
  responseDueAt: null,
  firstRespondedAt: null,
  closedAt: null,
  assignedToMe: false,
  hasAssignee: false,
  viewerOwnsTicket: true,
  sla: "not_set",
};
describe("support history initial and unknown states", () => {
  it("does not manufacture a legacy deadline or answered claim", () => {
    const html = renderToStaticMarkup(<SupportTicketMeta ticket={ticket} />);
    expect(html).toContain("Срок ответа не задан");
    expect(html).not.toContain("Первый ответ:");
    expect(html).not.toContain("Целевой ответ до");
  });
  it("starts with visible loading feedback and keeps staff commands out of the owner page", () => {
    const html = renderToStaticMarkup(<SupportInbox showCreate />);
    expect(html).toContain("Загружаем обращения…");
    expect(html).toContain("История обращений");
    expect(html).toContain("Создать обращение");
    expect(html).not.toContain("Только назначенные мне");
    expect(html).not.toContain("Работа с обращением");
    expect(html).not.toContain("Обращений пока нет");
  });
});
