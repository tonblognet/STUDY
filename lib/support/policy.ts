import { z } from "zod";
import type { Role } from "@prisma/client";

export const SUPPORT_ROLES: Role[] = ["SUPPORT", "ADMIN", "SUPERADMIN"];
export const SUPPORT_PAGE_SIZE = 20;
export const ticketStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_USER",
  "RESOLVED",
  "CLOSED",
] as const;
export const ticketPriorities = ["LOW", "NORMAL", "HIGH"] as const;
export const ticketStatusLabels: Record<string, string> = {
  OPEN: "Открыто",
  IN_PROGRESS: "В работе",
  WAITING_USER: "Ждём вашего ответа",
  RESOLVED: "Решено",
  CLOSED: "Закрыто",
};
export const ticketCategoryLabels: Record<string, string> = {
  DATA: "Ошибка в данных",
  AUTH: "Вход и аккаунт",
  PAYMENT: "Оплата",
  OTHER: "Другое",
};
export const ticketPriorityLabels: Record<string, string> = {
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Высокий",
};
export function canManageSupport(role: Role) {
  return SUPPORT_ROLES.includes(role);
}
const version = z.number().int().min(1).max(2147483646);
export const createTicketSchema = z
  .object({
    subject: z.string().trim().min(5).max(140),
    category: z.enum(["DATA", "AUTH", "PAYMENT", "OTHER"]),
    message: z.string().trim().min(20).max(5000),
  })
  .strict();
export const replyTicketSchema = z
  .object({ version, message: z.string().trim().min(1).max(5000) })
  .strict();
export const ownerTicketUpdateSchema = z
  .object({ version, status: z.enum(["OPEN", "CLOSED"]) })
  .strict();
export const staffTicketUpdateSchema = z
  .object({
    version,
    status: z.enum(ticketStatuses).optional(),
    priority: z.enum(ticketPriorities).optional(),
    assignment: z.enum(["self", "unassigned"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignment !== undefined,
  );
const page = z.coerce.number().int().min(1).max(1000).default(1);
export const ticketListSchema = z
  .object({
    page,
    status: z.enum(ticketStatuses).optional(),
    mine: z.enum(["true"]).optional(),
  })
  .strict();
export const messageListSchema = z
  .object({
    page,
    version: z.coerce.number().int().min(1).max(2147483646).optional(),
  })
  .strict()
  .refine((value) => value.page === 1 || value.version !== undefined);
export function isTicketId(value: string) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}
export function supportResponseHours(value?: string): number {
  if (value === undefined || value === "") return 48;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 168)
    throw new Error("SUPPORT_RESPONSE_HOURS must be between 1 and 168");
  return Number(value);
}
export function responseTarget(now: Date, hours: number) {
  return new Date(now.getTime() + hours * 3600000);
}
export function terminalTicket(status: string) {
  return status === "RESOLVED" || status === "CLOSED";
}
export function mayOwnerSetStatus(current: string, next: string) {
  return next === "CLOSED"
    ? current !== "CLOSED"
    : next === "OPEN" && terminalTicket(current);
}
export function supportSla(
  ticket: { status: string; responseDueAt: Date | null },
  now = new Date(),
) {
  if (terminalTicket(ticket.status)) return "closed";
  if (ticket.status === "WAITING_USER") return "waiting_user";
  if (!ticket.responseDueAt) return "not_set";
  return ticket.responseDueAt <= now ? "overdue" : "awaiting";
}
export type SupportTicketView = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  responseDueAt: string | null;
  firstRespondedAt: string | null;
  closedAt: string | null;
  assignedToMe: boolean;
  hasAssignee: boolean;
  viewerOwnsTicket: boolean;
  sla: ReturnType<typeof supportSla>;
};
export type SupportMessageView = {
  id: string;
  body: string;
  createdAt: string;
  fromOwner: boolean;
  fromViewer: boolean;
};
