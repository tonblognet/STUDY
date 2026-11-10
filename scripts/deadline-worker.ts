import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../db/index";
import {
  getEmailProvider,
  smtpConnectionOptions,
} from "../lib/notifications/email";
import { runDeadlineTick } from "../lib/operations/deadline-worker";

const worker = "personal_deadlines";
const interval = 60_000;
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ event, worker, at: new Date().toISOString(), ...data }),
  );
}

function deliverySettings() {
  const enabled = process.env.DEADLINE_EMAIL_ENABLED ?? "false";
  if (!["true", "false"].includes(enabled))
    throw new Error("DEADLINE_EMAIL_ENABLED invalid");
  if (enabled === "false") return undefined;
  const origin = new URL(process.env.APP_URL ?? "");
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(
        process.env.DEPLOYMENT_MODE === "staging" &&
        origin.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(origin.hostname)
      ))
  )
    throw new Error("APP_URL invalid");
  smtpConnectionOptions(
    process.env.SMTP_URL ?? "",
    process.env.DEPLOYMENT_MODE === "production",
  );
  if (!process.env.EMAIL_FROM || /[\r\n]/.test(process.env.EMAIL_FROM))
    throw new Error("EMAIL_FROM invalid");
  return { provider: getEmailProvider(), appOrigin: origin.origin };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !["--once", "--status"].includes(args[0])))
    throw new Error("Unsupported worker arguments");
  if (!process.env.DATABASE_URL || process.env.CATALOG_STORAGE !== "database")
    throw new Error("Database catalog configuration required");
  if (args[0] === "--status") {
    const heartbeat = await prisma.workerHeartbeat.findUnique({
      where: { id: worker },
    });
    const recent =
      !!heartbeat &&
      heartbeat.finishedAt.getTime() >= Date.now() - 5 * interval;
    emit("DEADLINE_WORKER_HEARTBEAT", {
      recent,
      finishedAt: heartbeat?.finishedAt ?? null,
    });
    if (!recent) process.exitCode = 1;
    return;
  }
  const delivery = deliverySettings();
  do {
    try {
      const result = await runDeadlineTick(prisma, delivery, stop.signal);
      emit("DEADLINE_WORKER_TICK", result);
    } catch {
      emit("DEADLINE_WORKER_FAILURE");
      if (args[0] === "--once") process.exitCode = 1;
    }
    if (args[0] === "--once" || stop.signal.aborted) break;
    await sleep(interval, undefined, { signal: stop.signal }).catch(
      (error: unknown) => {
        if (!stop.signal.aborted) throw error;
      },
    );
  } while (!stop.signal.aborted);
}

void main()
  .catch(() => {
    emit("DEADLINE_WORKER_START_FAILED");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
