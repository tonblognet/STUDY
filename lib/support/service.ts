import type { Prisma, SupportTicket, User } from "@prisma/client";
import { prisma } from "@/db";
import {
  lockActiveSession,
  type ActiveSession,
} from "@/lib/auth/session-access";
import {
  SUPPORT_PAGE_SIZE,
  canManageSupport,
  mayOwnerSetStatus,
  responseTarget,
  supportResponseHours,
  supportSla,
  terminalTicket,
  type createTicketSchema,
  type replyTicketSchema,
  type ownerTicketUpdateSchema,
  type staffTicketUpdateSchema,
  type ticketListSchema,
  type SupportTicketView,
} from "./policy";
import type { z } from "zod";

export class SupportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function view(ticket: SupportTicket, actorId: string): SupportTicketView {
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    version: ticket.version,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    responseDueAt: ticket.responseDueAt?.toISOString() ?? null,
    firstRespondedAt: ticket.firstRespondedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    assignedToMe: ticket.assigneeId === actorId,
    hasAssignee: Boolean(ticket.assigneeId),
    viewerOwnsTicket: ticket.userId === actorId,
    sla: supportSla(ticket),
  };
}
async function withActor<T>(
  access: ActiveSession,
  staff: boolean,
  work: (tx: Prisma.TransactionClient, actor: User) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const actor = await lockActiveSession(tx, access);
    if (!actor) throw new SupportError("Сессия истекла. Войдите снова", 401);
    if (staff && !canManageSupport(actor.role))
      throw new SupportError("Доступ запрещён", 403);
    return work(tx, actor);
  });
}
async function ownedTicket(
  tx: Prisma.TransactionClient,
  id: string,
  actor: User,
  staff: boolean,
  lock = false,
) {
  if (lock)
    await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} AND (${staff} OR "userId" = ${actor.id}) FOR UPDATE`;
  const ticket = await tx.supportTicket.findFirst({
    where: { id, ...(!staff ? { userId: actor.id } : {}) },
  });
  if (!ticket) throw new SupportError("Обращение не найдено", 404);
  return ticket;
}
async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  ticket: SupportTicket,
  action: string,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType: "SUPPORT_TICKET",
      entityId: ticket.id,
      after: {
        version: ticket.version,
        status: ticket.status,
        priority: ticket.priority,
        assigned: Boolean(ticket.assigneeId),
      },
    },
  });
}
export function listSupportTickets(
  access: ActiveSession,
  query: z.infer<typeof ticketListSchema>,
  staff = false,
) {
  return withActor(access, staff, async (tx, actor) => {
    const tickets = await tx.supportTicket.findMany({
      where: {
        ...(!staff ? { userId: actor.id } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(staff && query.mine ? { assigneeId: actor.id } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * SUPPORT_PAGE_SIZE,
      take: SUPPORT_PAGE_SIZE + 1,
    });
    return {
      tickets: tickets
        .slice(0, SUPPORT_PAGE_SIZE)
        .map((ticket) => view(ticket, actor.id)),
      hasMore: tickets.length > SUPPORT_PAGE_SIZE,
      page: query.page,
    };
  });
}
export function readSupportTicket(
  access: ActiveSession,
  id: string,
  page: number,
  staff = false,
  expectedVersion?: number,
) {
  return withActor(access, staff, async (tx, actor) => {
    const ticket = await ownedTicket(tx, id, actor, staff, true);
    if (expectedVersion !== undefined && ticket.version !== expectedVersion)
      throw new SupportError(
        "Обращение изменилось. Обновите переписку перед загрузкой истории",
        409,
      );
    const messages = await tx.ticketMessage.findMany({
      where: { ticketId: ticket.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * SUPPORT_PAGE_SIZE,
      take: SUPPORT_PAGE_SIZE + 1,
      select: { id: true, body: true, createdAt: true, authorId: true },
    });
    return {
      ticket: view(ticket, actor.id),
      page,
      hasMore: messages.length > SUPPORT_PAGE_SIZE,
      messages: messages
        .slice(0, SUPPORT_PAGE_SIZE)
        .reverse()
        .map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          fromOwner: message.authorId === ticket.userId,
          fromViewer: message.authorId === actor.id,
        })),
    };
  });
}
export function createSupportTicket(
  access: ActiveSession,
  input: z.infer<typeof createTicketSchema>,
) {
  return withActor(access, false, async (tx, actor) => {
    if (
      (await tx.supportTicket.count({
        where: { userId: actor.id, status: { notIn: ["RESOLVED", "CLOSED"] } },
      })) >= 20
    )
      throw new SupportError(
        "У вас уже 20 открытых обращений. Продолжите существующее обращение",
        409,
      );
    const ticket = await tx.supportTicket.create({
      data: {
        userId: actor.id,
        subject: input.subject,
        category: input.category,
        responseDueAt: responseTarget(
          new Date(),
          supportResponseHours(process.env.SUPPORT_RESPONSE_HOURS),
        ),
        messages: { create: { authorId: actor.id, body: input.message } },
      },
    });
    await audit(tx, actor.id, ticket, "CREATE_SUPPORT_TICKET");
    return { ticket: view(ticket, actor.id) };
  });
}
export function replySupportTicket(
  access: ActiveSession,
  id: string,
  input: z.infer<typeof replyTicketSchema>,
  staff = false,
) {
  return withActor(access, staff, async (tx, actor) => {
    const current = await ownedTicket(tx, id, actor, staff, true);
    if (current.version !== input.version)
      throw new SupportError(
        "Обращение изменилось. Обновите переписку и повторите действие",
        409,
      );
    if ((await tx.ticketMessage.count({ where: { ticketId: id } })) >= 1000)
      throw new SupportError(
        "В обращении уже 1000 сообщений. Создайте новое обращение",
        409,
      );
    const fromOwner = current.userId === actor.id;
    const now = new Date();
    await tx.ticketMessage.create({
      data: { ticketId: id, authorId: actor.id, body: input.message },
    });
    const ticket = await tx.supportTicket.update({
      where: { id },
      data: {
        version: { increment: 1 },
        status: fromOwner ? "OPEN" : "WAITING_USER",
        closedAt: null,
        responseDueAt: fromOwner
          ? current.status === "WAITING_USER" ||
            terminalTicket(current.status) ||
            !current.responseDueAt
            ? responseTarget(
                now,
                supportResponseHours(process.env.SUPPORT_RESPONSE_HOURS),
              )
            : current.responseDueAt
          : null,
        ...(!fromOwner && !current.firstRespondedAt
          ? { firstRespondedAt: now }
          : {}),
      },
    });
    await audit(tx, actor.id, ticket, "REPLY_SUPPORT_TICKET");
    return { ticket: view(ticket, actor.id) };
  });
}
export function updateSupportTicket(
  access: ActiveSession,
  id: string,
  input:
    | z.infer<typeof ownerTicketUpdateSchema>
    | z.infer<typeof staffTicketUpdateSchema>,
  staff = false,
) {
  return withActor(access, staff, async (tx, actor) => {
    const current = await ownedTicket(tx, id, actor, staff, true);
    if (current.version !== input.version)
      throw new SupportError(
        "Обращение изменилось. Обновите переписку и повторите действие",
        409,
      );
    if (
      !staff &&
      (!input.status || !mayOwnerSetStatus(current.status, input.status))
    )
      throw new SupportError("Этот переход статуса недоступен", 409);
    const now = new Date();
    const status = input.status ?? current.status;
    if (status === "WAITING_USER" && current.status !== "WAITING_USER")
      throw new SupportError(
        "Сначала отправьте сообщение, чтобы ожидать ответа пользователя",
        409,
      );
    const wasPaused =
      current.status === "WAITING_USER" || terminalTicket(current.status);
    const waiting = status === "OPEN" || status === "IN_PROGRESS";
    const ticket = await tx.supportTicket.update({
      where: { id },
      data: {
        version: { increment: 1 },
        status,
        closedAt: terminalTicket(status) ? (current.closedAt ?? now) : null,
        responseDueAt: waiting
          ? wasPaused
            ? responseTarget(
                now,
                supportResponseHours(process.env.SUPPORT_RESPONSE_HOURS),
              )
            : current.responseDueAt
          : null,
        ...(staff && "priority" in input && input.priority
          ? { priority: input.priority }
          : {}),
        ...(staff && "assignment" in input && input.assignment
          ? { assigneeId: input.assignment === "self" ? actor.id : null }
          : {}),
      },
    });
    await audit(tx, actor.id, ticket, "UPDATE_SUPPORT_TICKET");
    return { ticket: view(ticket, actor.id) };
  });
}
