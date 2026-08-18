import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { error: "legacy_endpoint", replacement: "/api/user-state" },
    { status: 410 },
  );
}
