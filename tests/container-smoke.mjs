import assert from "node:assert/strict";

const base = "http://127.0.0.1:3101";

function request(path, timeoutMs = 10_000) {
  const url = new URL(path, base);
  assert.equal(url.origin, base, "container smoke stays on loopback");
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function readBody(response, limit) {
  assert.ok(response.body, "container response has a body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        assert.fail("container response exceeded its size limit");
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

let live = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await request("/api/live", 2000);
    if (response.status === 200) {
      live = JSON.parse(await readBody(response, 1024))?.status === "alive";
    } else {
      await response.body?.cancel();
    }
    if (live) {
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(live, "isolated container starts");
const health = await request("/api/health");
assert.equal(
  health.status,
  200,
  "Linux Prisma engine reaches migrated test DB",
);
await health.body?.cancel();
const readiness = await request("/api/ready");
assert.equal(
  readiness.status,
  200,
  "the restricted web role reads migrations and the published catalog",
);
assert.deepEqual(JSON.parse(await readBody(readiness, 1024)), {
  status: "ready",
});
for (const path of ["/", "/support", "/pricing"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `container route ${path}`);
  const html = await readBody(response, 2 * 1024 * 1024);
  assert.match(html, /<main(?:\s|>)/);
  if (path === "/") {
    const asset = html.match(
      /(?:src|href)="([^"<>]*\/_next\/static\/[^"<>]+\.(?:js|css))"/,
    );
    assert.ok(asset, "standalone HTML references local static assets");
    const staticAsset = await request(asset[1].replaceAll("&amp;", "&"));
    assert.equal(staticAsset.status, 200);
    await staticAsset.body?.cancel();
  }
}
console.log(
  "Container smoke passed: restricted web role, Linux Prisma, published catalog, SSR/assets and health probes.",
);
