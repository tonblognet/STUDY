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
  replyTicketSchema,
  staffTicketUpdateSchema,
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
    const access = await supportAccess(request, true);
    const query = messageListSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new SupportError("Проверьте страницу переписки");
    return NextResponse.json(
      await readSupportTicket(
        access,
        supportId((await context.params).id),
        query.data.page,
        true,
        query.data.version,
      ),
    );
  } catch (error) {
    return supportFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const access = await supportAccess(request, true, true);
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
        true,
      ),
      { status: 201 },
    );
  } catch (error) {
    return supportFailure(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const access = await supportAccess(request, true, true);
    const input = staffTicketUpdateSchema.safeParse(await supportBody(request));
    if (!input.success)
      throw new SupportError(
        "Обновите переписку и проверьте параметры обращения",
      );
    await supportRate(access.user.id);
    return NextResponse.json(
      await updateSupportTicket(
        access,
        supportId((await context.params).id),
        input.data,
        true,
      ),
    );
  } catch (error) {
    return supportFailure(error);
  }
}
