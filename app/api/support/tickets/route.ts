import { NextResponse } from "next/server";
import {
  supportAccess,
  supportBody,
  supportFailure,
  supportRate,
} from "@/lib/support/http";
import { createTicketSchema, ticketListSchema } from "@/lib/support/policy";
import {
  createSupportTicket,
  listSupportTickets,
  SupportError,
} from "@/lib/support/service";
export async function GET(request: Request) {
  try {
    const access = await supportAccess(request);
    const query = ticketListSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success || query.data.mine)
      throw new SupportError("Проверьте параметры списка");
    return NextResponse.json(await listSupportTickets(access, query.data));
  } catch (error) {
    return supportFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const access = await supportAccess(request, false, true);
    const input = createTicketSchema.safeParse(await supportBody(request));
    if (!input.success)
      throw new SupportError(
        "Укажите тему от 5 до 140 символов, категорию и сообщение от 20 до 5000 символов",
      );
    await supportRate(access.user.id, true);
    return NextResponse.json(await createSupportTicket(access, input.data), {
      status: 201,
    });
  } catch (error) {
    return supportFailure(error);
  }
}
