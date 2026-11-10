import { describe, expect, it } from "vitest";
import {
  canManageSupport,
  createTicketSchema,
  messageListSchema,
  mayOwnerSetStatus,
  ownerTicketUpdateSchema,
  replyTicketSchema,
  responseTarget,
  staffTicketUpdateSchema,
  supportResponseHours,
  supportSla,
  ticketListSchema,
} from "./policy";

describe("support boundaries and response targets", () => {
  it("separates support from editorial roles", () => {
    for (const role of ["SUPPORT", "ADMIN", "SUPERADMIN"] as const)
      expect(canManageSupport(role)).toBe(true);
    for (const role of ["USER", "CONTENT_MANAGER"] as const)
      expect(canManageSupport(role)).toBe(false);
  });
  it("rejects ownership, assignment and unversioned command injection", () => {
    const create = {
      subject: "Ошибка в программе",
      category: "DATA",
      message: "Нашёл ошибку в описании программы",
    };
    expect(createTicketSchema.safeParse(create).success).toBe(true);
    expect(
      createTicketSchema.safeParse({ ...create, userId: "someone-else" })
        .success,
    ).toBe(false);
    expect(
      replyTicketSchema.safeParse({ message: "Ответ", version: 0 }).success,
    ).toBe(false);
    expect(
      ownerTicketUpdateSchema.safeParse({ version: 1, status: "RESOLVED" })
        .success,
    ).toBe(false);
    expect(
      ownerTicketUpdateSchema.safeParse({
        version: 1,
        status: "CLOSED",
        assigneeId: "actor",
      }).success,
    ).toBe(false);
    expect(
      staffTicketUpdateSchema.safeParse({ version: 1, assigneeId: "someone" })
        .success,
    ).toBe(false);
    expect(staffTicketUpdateSchema.safeParse({ version: 1 }).success).toBe(
      false,
    );
    expect(
      staffTicketUpdateSchema.safeParse({
        version: 1,
        assignment: "self",
        priority: "HIGH",
      }).success,
    ).toBe(true);
  });
  it("bounds pages and binds older message pages to the viewed version", () => {
    expect(ticketListSchema.parse({}).page).toBe(1);
    for (const page of ["0", "-1", "1.1", "1001", "Infinity", "no"])
      expect(ticketListSchema.safeParse({ page }).success).toBe(false);
    expect(ticketListSchema.safeParse({ userId: "other" }).success).toBe(false);
    expect(messageListSchema.safeParse({ page: "2" }).success).toBe(false);
    expect(messageListSchema.parse({ page: "2", version: "3" })).toEqual({
      page: 2,
      version: 3,
    });
  });
  it("does not let owners claim staff-only states", () => {
    expect(mayOwnerSetStatus("OPEN", "IN_PROGRESS")).toBe(false);
    expect(mayOwnerSetStatus("WAITING_USER", "OPEN")).toBe(false);
    expect(mayOwnerSetStatus("CLOSED", "OPEN")).toBe(true);
    expect(mayOwnerSetStatus("RESOLVED", "OPEN")).toBe(true);
    expect(mayOwnerSetStatus("OPEN", "CLOSED")).toBe(true);
    expect(mayOwnerSetStatus("CLOSED", "CLOSED")).toBe(false);
  });
  it("uses elapsed hours and rejects a broken operational policy", () => {
    expect(supportResponseHours()).toBe(48);
    expect(supportResponseHours("24")).toBe(24);
    for (const value of ["0", "169", "1.5", "bad", "-1", "Infinity"])
      expect(() => supportResponseHours(value)).toThrow();
    const now = new Date("2026-10-24T23:30:00.123Z");
    expect(responseTarget(now, 48).toISOString()).toBe(
      "2026-10-26T23:30:00.123Z",
    );
    expect(now.toISOString()).toBe("2026-10-24T23:30:00.123Z");
  });
  it("keeps legacy unknown targets unknown and pauses terminal/user-waiting states", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(supportSla({ status: "OPEN", responseDueAt: null }, now)).toBe(
      "not_set",
    );
    expect(supportSla({ status: "OPEN", responseDueAt: now }, now)).toBe(
      "overdue",
    );
    expect(
      supportSla(
        { status: "OPEN", responseDueAt: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe("awaiting");
    expect(
      supportSla({ status: "WAITING_USER", responseDueAt: now }, now),
    ).toBe("waiting_user");
    expect(supportSla({ status: "CLOSED", responseDueAt: now }, now)).toBe(
      "closed",
    );
  });
});
