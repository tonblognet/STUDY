import { NextResponse } from "next/server";
import { getActiveSession, getSessionUser } from "@/lib/auth/session";
import { getCatalog } from "@/lib/catalog/server";
import {
  loadUserState,
  saveUserState,
  StateConflict,
} from "@/lib/user-state/repository";
import { z } from "zod";
import { readBoundedJson, PayloadTooLarge } from "@/lib/security/body";
import { userStateSchema } from "@/lib/user-state/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!user)
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );

  try {
    return NextResponse.json({
      ...(await loadUserState(user)),
      storage: "account",
    });
  } catch (error) {
    console.error("Unable to load user state", error);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const access = await getActiveSession();
  const user = access?.user;
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!access || !user)
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );

  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin || requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000)
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof PayloadTooLarge)
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    payload = null;
  }
  const parsed = userStateSchema
    .extend({ version: z.number().int().min(0) })
    .safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { programs } = await getCatalog();
    const saved = await saveUserState(
      access,
      parsed.data,
      parsed.data.version,
      new Set(programs.map((program) => program.id)),
    );
    if (!saved)
      return NextResponse.json(
        { error: "authentication_required" },
        { status: 401 },
      );
    return NextResponse.json({
      ...saved.value,
      storage: "account",
    });
  } catch (error) {
    if (error instanceof StateConflict)
      return NextResponse.json({ error: "state_conflict" }, { status: 409 });
    console.error("Unable to save user state", error);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
}
