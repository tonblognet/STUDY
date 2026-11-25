import { setTimeout as sleep } from "node:timers/promises";

const maxBodyBytes = 2 * 1024 * 1024;
const requestTimeoutMs = 5000;
const probeBodyBytes = 1024;

function settings(args) {
  const [mode, ...options] = args;
  if (mode !== "--local" && mode !== "--staging") throw new Error("mode");
  const staging = mode === "--staging";
  const origin = new URL(
    staging ? (process.env.POSTUPAI_STAGING_ORIGIN ?? "") : options.shift(),
  );
  const allowedOptions = staging ? ["--confirm-owned-staging"] : ["--ready"];
  let rounds = 1;
  let roundsSet = false;
  const flags = new Set();
  for (const option of options) {
    const match = /^--rounds=(10|[1-9])$/.exec(option);
    if (match && !roundsSet) {
      rounds = Number(match[1]);
      roundsSet = true;
    } else if (allowedOptions.includes(option) && !flags.has(option)) {
      flags.add(option);
    } else {
      throw new Error("option");
    }
  }
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("origin");
  if (staging) {
    if (
      origin.protocol !== "https:" ||
      origin.port ||
      !/^staging\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(origin.hostname) ||
      !flags.has("--confirm-owned-staging")
    )
      throw new Error("staging origin");
  } else if (
    !["http:", "https:"].includes(origin.protocol) ||
    !["127.0.0.1", "[::1]"].includes(origin.hostname) ||
    !origin.port
  ) {
    throw new Error("loopback origin");
  }
  return {
    origin,
    rounds,
    staging,
    ready: staging || flags.has("--ready"),
  };
}

function targets({ staging, ready }) {
  const probes = [
    { path: "/api/live", expected: 200, health: "alive" },
    {
      path: "/api/ready",
      expected: ready ? 200 : 503,
      health: ready ? "ready" : "not_ready",
    },
  ];
  return staging
    ? [...probes, { path: "/", expected: 401, basic: true }]
    : [
        ...probes,
        ...["/", "/programs", "/universities"].map((path) => ({
          path,
          expected: 200,
          html: true,
        })),
      ];
}

async function sample(origin, target) {
  const start = performance.now();
  const signal = AbortSignal.timeout(requestTimeoutMs);
  let status = null;
  let headersMs = null;
  let bodyBytes = 0;
  let issue = null;
  try {
    const response = await fetch(new URL(target.path, origin), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal,
    });
    status = response.status;
    headersMs = Math.round(performance.now() - start);
    if (status !== target.expected) issue = "status";
    if (
      target.basic &&
      !/^Basic\b/i.test(response.headers.get("www-authenticate") ?? "")
    )
      issue ??= "staging_gate";
    if (
      target.html &&
      !/^text\/html\b/i.test(response.headers.get("content-type") ?? "")
    )
      issue ??= "content_type";

    const reader = response.body?.getReader();
    const decoder = target.health ? new TextDecoder() : null;
    let health = "";
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bodyBytes += value.byteLength;
          if (bodyBytes > (target.health ? probeBodyBytes : maxBodyBytes)) {
            issue ??= "response_limit";
            await reader.cancel();
            break;
          }
          if (decoder) health += decoder.decode(value, { stream: true });
        }
      } finally {
        reader.releaseLock();
      }
    }
    if (decoder && !issue) {
      try {
        if (JSON.parse(health + decoder.decode())?.status !== target.health)
          issue = "probe_body";
      } catch {
        issue = "probe_body";
      }
    }
  } catch {
    issue ??= signal.aborted ? "timeout" : "network";
  }
  return {
    status,
    headersMs,
    totalMs: Math.round(performance.now() - start),
    bodyBytes,
    issue,
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * p) - 1];
}

let config;
try {
  config = settings(process.argv.slice(2));
} catch {
  console.error(
    "Usage: staging-smoke.mjs --local http://127.0.0.1:PORT [--ready] [--rounds=1..10] or --staging --confirm-owned-staging [--rounds=1..10] with POSTUPAI_STAGING_ORIGIN=https://staging.OWN-DOMAIN",
  );
  process.exit(2);
}

const routes = targets(config).map((target) => ({ target, samples: [] }));
for (let round = 0; round < config.rounds; round++) {
  // Two requests in flight at most. Each round has one GET per allowlisted path.
  for (let start = 0; start < routes.length; start += 2) {
    await Promise.all(
      routes.slice(start, start + 2).map(async (route) => {
        route.samples.push(await sample(config.origin, route.target));
      }),
    );
  }
  if (round + 1 < config.rounds) await sleep(500);
}

const rows = routes.map(({ target, samples }) => {
  const good = samples.filter(({ issue }) => issue === null);
  const warm = samples.slice(1).filter(({ issue }) => issue === null);
  return {
    path: target.path,
    expectedStatus: target.expected,
    passed: good.length,
    failed: samples.length - good.length,
    statuses: [...new Set(samples.map(({ status }) => status))],
    issues: [
      ...new Set(samples.flatMap(({ issue }) => (issue ? [issue] : []))),
    ],
    firstMs: samples[0].totalMs,
    p95HeadersMs: percentile(
      good.map(({ headersMs }) => headersMs),
      0.95,
    ),
    p95TotalMs: percentile(
      good.map(({ totalMs }) => totalMs),
      0.95,
    ),
    p95WarmHeadersMs: percentile(
      warm.map(({ headersMs }) => headersMs),
      0.95,
    ),
    maxDecodedBytes: Math.max(...samples.map(({ bodyBytes }) => bodyBytes)),
  };
});
const ok = rows.every(({ failed }) => failed === 0);
console.log(
  JSON.stringify({
    checkedAt: new Date().toISOString(),
    scope: config.staging ? "owned_staging_edge" : "loopback",
    rounds: config.rounds,
    ok,
    routes: rows,
  }),
);
process.exitCode = ok ? 0 : 1;
