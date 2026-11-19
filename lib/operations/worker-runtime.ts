import { smtpConnectionOptions } from "../notifications/email";

type Environment = Readonly<Record<string, string | undefined>>;
export const deadlineWorkerInterval = 60_000;
const heartbeatMaxAge = 5 * 60_000;

/** Validate the worker independently of web readiness. Errors contain codes only. */
export function deadlineWorkerSettings(env: Environment = process.env) {
  const mode = env.DEPLOYMENT_MODE;
  if (mode !== "staging" && mode !== "production")
    throw new Error("DEPLOYMENT_MODE invalid");
  if (env.CATALOG_STORAGE !== "database")
    throw new Error("CATALOG_STORAGE invalid");
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !database.hostname ||
      (mode === "production" &&
        (database.searchParams.getAll("sslmode").join() !== "require" ||
          database.searchParams.getAll("sslaccept").join() !== "strict"))
    )
      throw new Error();
  } catch {
    throw new Error("DATABASE_URL invalid");
  }

  const enabled = env.DEADLINE_EMAIL_ENABLED ?? "false";
  if (enabled !== "true" && enabled !== "false")
    throw new Error("DEADLINE_EMAIL_ENABLED invalid");
  if (enabled === "false") return { mode, delivery: undefined };

  let appOrigin: string;
  try {
    const origin = new URL(env.APP_URL ?? "");
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
      origin.hostname,
    );
    if (
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/" ||
      (mode === "production" && loopback) ||
      (origin.protocol !== "https:" &&
        !(mode === "staging" && origin.protocol === "http:" && loopback))
    )
      throw new Error();
    appOrigin = origin.origin;
  } catch {
    throw new Error("APP_URL invalid");
  }
  try {
    smtpConnectionOptions(env.SMTP_URL ?? "", mode === "production");
  } catch {
    throw new Error("SMTP_URL invalid");
  }
  if (
    !env.EMAIL_FROM ||
    env.EMAIL_FROM.length > 320 ||
    /[\r\n]/.test(env.EMAIL_FROM) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
      env.EMAIL_FROM.match(/<([^<>]+)>$/)?.[1] ?? env.EMAIL_FROM,
    )
  )
    throw new Error("EMAIL_FROM invalid");
  return { mode, delivery: { appOrigin } };
}

export function deadlineWorkerHeartbeatRecent(
  finishedAt: Date | null | undefined,
  now = Date.now(),
) {
  if (!finishedAt || !Number.isFinite(now)) return false;
  const age = now - finishedAt.getTime();
  return Number.isFinite(age) && age >= 0 && age <= heartbeatMaxAge;
}
