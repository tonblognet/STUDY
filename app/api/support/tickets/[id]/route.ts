import { NextResponse } from "next/server";
import {
  supportAccess,
  supportBody,
  supportFailure,
  supportId,
  supportRate,
} from "@/lib/support/http";
import {
  messageListSchema,
  ownerTicketUpdateSchema,
  replyTicketSchema,
} from "@/lib/support/policy";
import {
  readSupportTicket,
  replySupportTicket,
  updateSupportTicket,
  SupportError,
} from "@/lib/support/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const access = await supportAccess(request);
    const query = messageListSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new SupportError("Проверьте страницу переписки");
    return NextResponse.json(
      await readSupportTicket(
        access,
        supportId((await context.params).id),
        query.data.page,
        false,
        query.data.version,
      ),
    );
  } catch (error) {
    return supportFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const access = await supportAccess(request, false, true);
    const input = replyTicketSchema.safeParse(await supportBody(request));
    if (!input.success)
      throw new SupportError(
        "Обновите переписку и введите сообщение до 5000 символов",
      );
    await supportRate(access.user.id);
    return NextResponse.json(
      await replySupportTicket(
        access,
        supportId((await context.params).id),
        input.data,
      ),
      { status: 201 },
    );
  } catch (error) {
    return supportFailure(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const access = await supportAccess(request, false, true);
    const input = ownerTicketUpdateSchema.safeParse(await supportBody(request));
    if (!input.success)
      throw new SupportError("Обновите переписку и выберите доступный статус");
    await supportRate(access.user.id);
    return NextResponse.json(
      await updateSupportTicket(
        access,
        supportId((await context.params).id),
        input.data,
      ),
    );
  } catch (error) {
    return supportFailure(error);
  }
}
