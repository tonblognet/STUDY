import assert from "node:assert/strict";

const base = "http://127.0.0.1:3101";
let live = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    if (
      (await fetch(`${base}/api/live`, { signal: AbortSignal.timeout(2000) }))
        .ok
    ) {
      live = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(live, "isolated container starts");
assert.equal(
  (await fetch(`${base}/api/health`)).status,
  200,
  "Linux Prisma engine reaches migrated test DB",
);
const readiness = await fetch(`${base}/api/ready`);
assert.equal(
  readiness.status,
  503,
  "snapshot preview never claims production readiness",
);
assert.deepEqual(await readiness.json(), { status: "not_ready" });
for (const path of ["/", "/support", "/pricing"]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, `container route ${path}`);
  const html = await response.text();
  assert.match(html, /<main(?:\s|>)/);
  if (path === "/") {
    const asset = html.match(
      /(?:src|href)="([^"<>]*\/_next\/static\/[^"<>]+\.(?:js|css))"/,
    );
    assert.ok(asset, "standalone HTML references local static assets");
    assert.equal(
      (await fetch(new URL(asset[1].replaceAll("&amp;", "&"), base))).status,
      200,
    );
  }
}
console.log(
  "Container smoke passed: nonpublic fixture, Linux Prisma, SSR/assets, liveness and fail-closed readiness.",
);
