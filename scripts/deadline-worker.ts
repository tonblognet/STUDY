import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../db/index";
import { getEmailProvider } from "../lib/notifications/email";
import { runDeadlineTick } from "../lib/operations/deadline-worker";
import {
  deadlineWorkerHeartbeatRecent,
  deadlineWorkerInterval,
  deadlineWorkerSettings,
} from "../lib/operations/worker-runtime";

const worker = "personal_deadlines";
const interval = deadlineWorkerInterval;
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());

function emit(event: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ event, worker, at: new Date().toISOString(), ...data }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !["--once", "--status"].includes(args[0])))
    throw new Error("Unsupported worker arguments");
  const settings = deadlineWorkerSettings();
  if (args[0] === "--status") {
    const heartbeat = await prisma.workerHeartbeat.findUnique({
      where: { id: worker },
    });
    const recent = deadlineWorkerHeartbeatRecent(heartbeat?.finishedAt);
    emit("DEADLINE_WORKER_HEARTBEAT", {
      recent,
      finishedAt: heartbeat?.finishedAt ?? null,
    });
    if (!recent) process.exitCode = 1;
    return;
  }
  const delivery = settings.delivery
    ? { provider: getEmailProvider(), appOrigin: settings.delivery.appOrigin }
    : undefined;
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
