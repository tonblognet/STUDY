import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { programs } from "@/lib/data";
import { loadUserState, saveUserState } from "@/lib/user-state/repository";
import {
  normalizeUserState,
  userStateSchema,
} from "@/lib/user-state/validation";

export const dynamic = "force-dynamic";

const allowedProgramIds = new Set(programs.map((program) => program.id));

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );

  try {
    return NextResponse.json({
      state: await loadUserState(user),
      storage: "account",
    });
  } catch (error) {
    console.error("Unable to load user state", error);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user)
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

  const payload = await request.json().catch(() => null);
  const parsed = userStateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const state = normalizeUserState(parsed.data, allowedProgramIds);
    return NextResponse.json({
      state: await saveUserState(user, state),
      storage: "account",
    });
  } catch (error) {
    console.error("Unable to save user state", error);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
}
