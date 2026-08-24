import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { getSessionUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";

const ticketSchema = z.object({
  subject: z.string().trim().min(5).max(140),
  category: z.enum(["DATA", "AUTH", "PAYMENT", "OTHER"]),
  message: z.string().trim().min(20).max(5000),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const parsed = ticketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Проверьте обращение" },
      { status: 400 },
    );
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      subject: parsed.data.subject,
      category: parsed.data.category,
      messages: { create: { authorId: user.id, body: parsed.data.message } },
    },
  });
  return NextResponse.json({ ticket }, { status: 201 });
}
