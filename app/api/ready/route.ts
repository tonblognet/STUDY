import { NextResponse } from "next/server";
import { prisma } from "@/db";
import { databaseReady, deploymentIssues } from "@/lib/operations/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  let ready = false;
  if (deploymentIssues().length === 0) {
    try {
      ready = await databaseReady(prisma);
    } catch {
      // Neither exception details nor configuration values leave this probe.
    }
  }
  return NextResponse.json(
    { status: ready ? "ready" : "not_ready" },
    { status: ready ? 200 : 503 },
  );
}
