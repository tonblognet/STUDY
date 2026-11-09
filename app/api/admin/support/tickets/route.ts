import { NextResponse } from "next/server";
import { supportAccess, supportFailure } from "@/lib/support/http";
import { ticketListSchema } from "@/lib/support/policy";
import { listSupportTickets, SupportError } from "@/lib/support/service";
export async function GET(request: Request) {
  try {
    const access = await supportAccess(request, true);
    const query = ticketListSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new SupportError("Проверьте параметры очереди");
    return NextResponse.json(
      await listSupportTickets(access, query.data, true),
    );
  } catch (error) {
    return supportFailure(error);
  }
}
