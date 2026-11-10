import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { PrismaClient, type Role } from "@prisma/client";
import { createOpaqueToken } from "../lib/auth/crypto";
import { createTbankToken } from "../lib/payments/tbank";

const testUrl = new URL(process.env.TEST_DATABASE_URL ?? "");
if (
  !testUrl.pathname.endsWith("_test") ||
  !["127.0.0.1", "localhost"].includes(testUrl.hostname)
)
  throw new Error("Dedicated local TEST_DATABASE_URL required");
const schema = `operations_test_${randomUUID().replaceAll("-", "")}`;
testUrl.searchParams.set("schema", schema);
const base = "http://localhost:3217";
const terminal = "operations-fixture-terminal",
  password = "operations-fixture-password";
process.env.DATABASE_URL = testUrl.href;
const db = new PrismaClient({ datasources: { db: { url: testUrl.href } } });
type Actor = { id: string; cookie: string; role: Role };
type FixturePayment = {
  PaymentId: string;
  OrderId: string;
  Amount: number;
  Status: string;
};
const bankPayments = new Map<string, FixturePayment>();
const refundRequests = new Map<string, string>();
let initCalls = 0,
  cancelSettlements = 0,
  nextId = 100000,
  dropInit = false,
  dropCancel = false;
let releaseInit: (() => void) | undefined;
let holdInit: Promise<void> | undefined;
let server: ChildProcess | undefined;
let staff: Actor, support: Actor, editor: Actor, superadmin: Actor;
const bank = createServer((request, response) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.equal(payload.Token, createTbankToken(payload, password));
    assert.equal(payload.TerminalKey, terminal);
    let result: Record<string, unknown>;
    if (request.url === "/v2/Init") {
      initCalls++;
      assert.equal(payload.PayType, "O");
      assert.equal(payload.DATA.OperationInitiatorType, "0");
      assert.equal(payload.Receipt.Items[0].Amount, payload.Amount);
      const payment = {
        PaymentId: String(++nextId),
        OrderId: payload.OrderId,
        Amount: payload.Amount,
        Status: "NEW",
      };
      bankPayments.set(payment.PaymentId, payment);
      if (holdInit) await holdInit;
      if (dropInit) {
        dropInit = false;
        request.socket.destroy();
        return;
      }
      result = {
        ...payment,
        PaymentURL: `https://securepay.tinkoff.ru/new/fixture-${payment.PaymentId}`,
      };
    } else if (request.url === "/v2/GetState") {
      result = { ...bankPayments.get(String(payload.PaymentId))! };
    } else if (request.url === "/v2/CheckOrder") {
      result = {
        OrderId: payload.OrderId,
        Payments: [...bankPayments.values()].filter(
          (p) => p.OrderId === payload.OrderId,
        ),
      };
    } else if (request.url === "/v2/Cancel") {
      const payment = bankPayments.get(String(payload.PaymentId))!;
      assert.ok(payment);
      assert.equal(payload.Amount, undefined);
      assert.equal(payload.Receipt, undefined);
      assert.match(payload.ExternalRequestId, /^[a-f0-9]{30}$/);
      const previous = refundRequests.get(payload.ExternalRequestId);
      if (previous) assert.equal(previous, payment.PaymentId);
      else {
        refundRequests.set(payload.ExternalRequestId, payment.PaymentId);
        cancelSettlements++;
      }
      payment.Status = "REFUNDED";
      if (dropCancel) {
        dropCancel = false;
        request.socket.destroy();
        return;
      }
      result = { PaymentId: payment.PaymentId, Status: payment.Status };
    } else throw new Error("Unknown synthetic bank request");
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        Success: true,
        ErrorCode: "0",
        TerminalKey: terminal,
        ...result,
      }),
    );
  })().catch(() => {
    response.statusCode = 500;
    response.end("fixture failure");
  });
});

async function actor(role: Role = "USER"): Promise<Actor> {
  const user = await db.user.create({
    data: {
      email: `operations-${randomUUID()}@example.invalid`,
      emailVerified: new Date(),
      role,
    },
  });
  const token = createOpaqueToken();
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: token.tokenHash,
      authVersion: 0,
      expires: new Date(Date.now() + 3600000),
    },
  });
  return { id: user.id, cookie: `postupai_session=${token.token}`, role };
}
function api(
  who: Actor | null,
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      origin: base,
      "content-type": "application/json",
      ...(who ? { cookie: who.cookie, "x-account-id": who.id } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function checked(response: Response, status: number) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function checkout(
  who: Actor,
  key = randomUUID(),
  planCode = "default_1",
) {
  const response = await api(
    who,
    "/api/checkout",
    "POST",
    { planCode },
    { "idempotency-key": key },
  );
  assert.ok(
    [200, 202].includes(response.status),
    await response.clone().text(),
  );
  return { ...(await response.json()), key };
}
function bankRow(orderId: string) {
  const result = [...bankPayments.values()].find((p) => p.OrderId === orderId);
  assert.ok(result);
  return result;
}
function notify(
  payment: FixturePayment,
  status = "CONFIRMED",
  amount: number | string = payment.Amount,
  overrides: Record<string, unknown> = {},
) {
  const body = {
    TerminalKey: terminal,
    ...payment,
    Status: status,
    Amount: amount,
    Success: true,
    ErrorCode: "0",
    CardId: "signed-extra-scalar",
    ...overrides,
  };
  return api(null, "/api/webhooks/payments", "POST", {
    ...body,
    Token: createTbankToken(body, password),
  });
}
async function waitUntil(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 20000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Fixture evidence timed out");
    await new Promise((done) => setTimeout(done, 50));
  }
}

before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env }, stdio: "pipe", windowsHide: true },
  );
  const entitlement = await db.entitlement.create({
    data: { key: "admission_full_data", name: "Fixture access" },
  });
  for (const [code, price, durationDays] of [
    ["default_1", 19900, 30],
    ["default_3", 34900, 90],
  ] as const) {
    await db.product.create({
      data: {
        code,
        price,
        durationDays,
        name: `Fixture ${code}`,
        features: [],
        entitlements: { create: { entitlementId: entitlement.id } },
      },
    });
  }
  staff = await actor("ADMIN");
  support = await actor("SUPPORT");
  editor = await actor("CONTENT_MANAGER");
  superadmin = await actor("SUPERADMIN");
  bank.listen(3230, "127.0.0.1");
  await once(bank, "listening");
  const preload = pathToFileURL(resolve("tests/tbank-fetch-preload.mjs")).href;
  server = spawn(
    process.execPath,
    [
      "--import",
      preload,
      "node_modules/next/dist/bin/next",
      "start",
      "-p",
      "3217",
      "-H",
      "127.0.0.1",
    ],
    {
      windowsHide: true,
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "production",
        AUTH_SECRET: "operations-local-fixture-secret-at-least-32-characters",
        APP_URL: base,
        CATALOG_STORAGE: "snapshot",
        PAYMENT_PROVIDER: "tbank",
        PAYMENTS_LIVE: "true",
        PAYMENT_ENABLED_PRODUCTS: "default_1,default_3",
        TBANK_ENVIRONMENT: "live",
        TBANK_API_URL: "https://securepay.tinkoff.ru/v2",
        TBANK_TERMINAL_KEY: terminal,
        TBANK_PASSWORD: password,
        TBANK_NOTIFICATION_URL: `${base}/api/webhooks/payments`,
        TBANK_FISCALIZATION_READY: "true",
        TBANK_RECEIPT_TAXATION: "usn_income",
        TBANK_RECEIPT_TAX: "none",
        TBANK_RECEIPT_METHOD: "full_payment",
        TBANK_RECEIPT_OBJECT: "service",
        TBANK_RECEIPT_FFD: "1.2",
        TBANK_RECEIPT_MEASUREMENT_UNIT: "шт",
        SUPPORT_RESPONSE_HOURS: "48",
        TEST_TBANK_FIXTURE_URL: "http://127.0.0.1:3230",
      },
    },
  );
  // Drain pipes without printing any request, receipt or credential.
  server.stdout!.on("data", () => {});
  server.stderr!.on("data", () => {});
  await waitUntil(async () => {
    if (server?.exitCode !== null)
      throw new Error("Operations HTTP server exited");
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch {
      return false;
    }
  });
});
after(async () => {
  releaseInit?.();
  if (server && server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
  bank.close();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});

describe("layer 06 HTTP/PostgreSQL operations", { concurrency: false }, () => {
  it("reuses an attempt across simultaneous requests and rejects owner/product collisions", async () => {
    const owner = await actor(),
      other = await actor(),
      key = randomUUID();
    const previousCalls = initCalls;
    holdInit = new Promise((done) => {
      releaseInit = done;
    });
    const first = checkout(owner, key);
    await waitUntil(() => initCalls === previousCalls + 1);
    const repeated = await checkout(owner, key);
    assert.equal(repeated.payment.attemptState, "IN_FLIGHT");
    await checked(
      await api(
        other,
        "/api/checkout",
        "POST",
        { planCode: "default_1" },
        { "idempotency-key": key },
      ),
      409,
    );
    await checked(
      await api(
        owner,
        "/api/checkout",
        "POST",
        { planCode: "default_3" },
        { "idempotency-key": key },
      ),
      409,
    );
    releaseInit!();
    holdInit = undefined;
    releaseInit = undefined;
    const result = await first;
    assert.equal(result.payment.id, repeated.payment.id);
    const history = await checked(
      await api(owner, "/api/account/billing"),
      200,
    );
    assert.equal(history.items[0].resumeUrl, result.paymentUrl);
    assert.equal(
      (await checked(await api(other, "/api/account/billing"), 200)).items
        .length,
      0,
    );
    assert.equal((await checkout(owner, key)).paymentUrl, result.paymentUrl);
    assert.equal(initCalls, previousCalls + 1);
    assert.equal(await db.payment.count({ where: { idempotencyKey: key } }), 1);
  });
  it("serializes confirmations, freezes purchase conditions and ignores late failures", async () => {
    const owner = await actor();
    const result = await checkout(owner);
    const payment = bankRow(result.payment.id);
    const before = await db.payment.findUniqueOrThrow({
      where: { id: result.payment.id },
    });
    await db.product.update({
      where: { id: before.productId },
      data: { durationDays: 100, price: 88888 },
    });
    try {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => notify(payment)),
      );
      assert.ok(responses.every((response) => response.status === 200));
      const saved = await db.payment.findUniqueOrThrow({
        where: { id: before.id },
        include: { grant: { include: { subscription: true } } },
      });
      assert.equal(saved.status, "SUCCEEDED");
      assert.ok(saved.grant);
      assert.equal(
        await db.paymentGrant.count({ where: { paymentId: saved.id } }),
        1,
      );
      const days =
        (saved.grant.subscription.currentPeriodEnd!.getTime() -
          saved.grant.issuedAt.getTime()) /
        86400000;
      assert.equal(days, 30);
      assert.equal((await notify(payment, "REJECTED")).status, 200);
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: saved.id } }))
          .status,
        "SUCCEEDED",
      );
      assert.deepEqual(
        (await checked(await api(owner, "/api/account/billing"), 200))
          .entitlements,
        ["admission_full_data"],
      );
      assert.equal(
        (
          await api(
            owner,
            "/api/checkout",
            "POST",
            { planCode: "default_3" },
            { "idempotency-key": randomUUID() },
          )
        ).status,
        409,
      );
    } finally {
      await db.product.update({
        where: { id: before.productId },
        data: { durationDays: 30, price: 19900 },
      });
    }
    // A failed order may confirm late after a newer order already granted
    // access. Reconciliation must keep the unfulfilled charge in the queue.
    const lateOwner = await actor();
    const older = await checkout(lateOwner);
    const olderBank = bankRow(older.payment.id);
    assert.equal((await notify(olderBank, "REJECTED")).status, 200);
    const newer = await checkout(lateOwner);
    assert.equal((await notify(bankRow(newer.payment.id))).status, 200);
    olderBank.Status = "CONFIRMED";
    assert.equal((await notify(olderBank)).status, 200);
    const reconciled = await checked(
      await api(staff, `/api/admin/billing/${older.payment.id}`, "POST", {
        action: "reconcile",
        key: randomUUID(),
      }),
      200,
    );
    assert.equal(reconciled.payment.status, "SUCCEEDED");
    assert.equal(reconciled.payment.needsReview, true);
    assert.equal(
      await db.paymentGrant.count({
        where: { payment: { userId: lateOwner.id } },
      }),
      1,
    );
    assert.equal(
      await db.paymentGrant.count({ where: { paymentId: older.payment.id } }),
      0,
    );
  });
  it("keeps a lost Init response unknown and recovers without a second Init", async () => {
    const owner = await actor();
    dropInit = true;
    const previousCalls = initCalls;
    const result = await checkout(owner);
    assert.equal(result.payment.attemptState, "UNKNOWN");
    assert.equal(result.paymentUrl, undefined);
    await checkout(owner, result.key);
    assert.equal(initCalls, previousCalls + 1);
    const row = bankRow(result.payment.id);
    row.Status = "CONFIRMED";
    const observed = await checked(
      await api(staff, `/api/admin/billing/${result.payment.id}`, "POST", {
        action: "reconcile",
        key: randomUUID(),
      }),
      200,
    );
    assert.equal(observed.payment.status, "SUCCEEDED");
    assert.equal(initCalls, previousCalls + 1);
    assert.equal(
      await db.paymentGrant.count({ where: { paymentId: result.payment.id } }),
      1,
    );
  });
  it("keeps multiple bank IDs ambiguous rather than choosing a charge", async () => {
    const owner = await actor();
    dropInit = true;
    const result = await checkout(owner);
    const row = bankRow(result.payment.id);
    bankPayments.set(String(++nextId), { ...row, PaymentId: String(nextId) });
    await checked(
      await api(staff, `/api/admin/billing/${result.payment.id}`, "POST", {
        action: "reconcile",
        key: randomUUID(),
      }),
      409,
    );
    const saved = await db.payment.findUniqueOrThrow({
      where: { id: result.payment.id },
    });
    assert.equal(saved.providerPaymentId, null);
    assert.equal(saved.needsReview, true);
    assert.equal(
      await db.paymentGrant.count({ where: { paymentId: saved.id } }),
      0,
    );
  });
  it("retries a lost refund response with one external bank key and one revocation", async () => {
    const owner = await actor();
    const result = await checkout(owner);
    const row = bankRow(result.payment.id);
    assert.equal((await notify(row)).status, 200);
    const key = randomUUID(),
      settlements = cancelSettlements;
    dropCancel = true;
    const first = await checked(
      await api(staff, `/api/admin/billing/${row.OrderId}`, "POST", {
        action: "refund",
        key,
      }),
      200,
    );
    assert.equal(first.operation, "UNKNOWN");
    const second = await checked(
      await api(staff, `/api/admin/billing/${row.OrderId}`, "POST", {
        action: "refund",
        key,
      }),
      200,
    );
    assert.equal(second.payment.status, "REFUNDED");
    assert.equal(cancelSettlements, settlements + 1);
    const grant = await db.paymentGrant.findUniqueOrThrow({
      where: { paymentId: row.OrderId },
      include: { subscription: true },
    });
    assert.ok(grant.revokedAt);
    assert.equal(grant.subscription.status, "CANCELED");
    assert.equal((await notify(row, "CONFIRMED")).status, 200);
    assert.equal(
      (await db.payment.findUniqueOrThrow({ where: { id: row.OrderId } }))
        .status,
      "REFUNDED",
    );
    assert.deepEqual(
      (await checked(await api(owner, "/api/account/billing"), 200))
        .entitlements,
      [],
    );
  });
  it("records a partial refund without summing its Amount or restoring access", async () => {
    const owner = await actor();
    const result = await checkout(owner);
    const row = bankRow(result.payment.id);
    assert.equal((await notify(row)).status, 200);
    assert.equal((await notify(row, "PARTIAL_REFUNDED", "0")).status, 200);
    assert.equal((await notify(row)).status, 200);
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: row.OrderId },
      include: { grant: true },
    });
    assert.equal(payment.status, "PARTIALLY_REFUNDED");
    assert.ok(payment.grant?.revokedAt);
    assert.equal(payment.needsReview, true);
  });
  it("rejects malformed signatures, wrong cents, foreign resources and forbidden financial roles", async () => {
    const owner = await actor();
    const result = await checkout(owner);
    const row = bankRow(result.payment.id);
    assert.equal(
      (
        await api(null, "/api/webhooks/payments", "POST", {
          TerminalKey: terminal,
          Token: "é".repeat(64),
        })
      ).status,
      401,
    );
    assert.equal((await notify(row, "CONFIRMED", row.Amount + 1)).status, 409);
    assert.equal((await checkout(owner, result.key)).paymentUrl, undefined);
    for (const who of [support, editor, await actor()]) {
      assert.equal((await api(who, "/api/admin/billing")).status, 403);
      assert.equal(
        (
          await api(who, `/api/admin/billing/${row.OrderId}`, "POST", {
            action: "refund",
            key: randomUUID(),
          })
        ).status,
        403,
      );
    }
    const other = await actor();
    assert.equal(
      (await api(other, `/api/account/billing?cursor=${row.OrderId}`)).status,
      400,
    );
    assert.equal(
      (
        await api(owner, "/api/account/billing", "GET", undefined, {
          "x-account-id": other.id,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api(
          owner,
          "/api/checkout",
          "POST",
          { planCode: "default_1" },
          {
            origin: "https://attacker.invalid",
            "idempotency-key": randomUUID(),
          },
        )
      ).status,
      403,
    );
  });
  it("rolls a grant and financial transition back when audit persistence fails", async () => {
    const owner = await actor();
    const result = await checkout(owner);
    const row = bankRow(result.payment.id);
    await db.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" ADD CONSTRAINT "operations_audit_fixture" CHECK ("action" <> 'PAYMENT_BANK_STATE') NOT VALID`,
    );
    try {
      assert.equal((await notify(row)).status, 503);
      assert.equal(
        await db.paymentGrant.count({ where: { paymentId: row.OrderId } }),
        0,
      );
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: row.OrderId } }))
          .status,
        "PENDING",
      );
    } finally {
      await db.$executeRawUnsafe(
        `ALTER TABLE "AuditLog" DROP CONSTRAINT "operations_audit_fixture"`,
      );
    }
    assert.equal((await notify(row)).status, 200);
    assert.equal(
      await db.paymentGrant.count({ where: { paymentId: row.OrderId } }),
      1,
    );
  });
  it("runs owner/staff support history, conflicts, reopen and safe audit", async () => {
    const owner = await actor(),
      other = await actor();
    const created = await checked(
      await api(owner, "/api/support/tickets", "POST", {
        subject: "Fixture support request",
        category: "PAYMENT",
        message: "Private fixture support message for a payment.",
      }),
      201,
    );
    const id = created.ticket.id;
    const foreign = await api(other, `/api/support/tickets/${id}`),
      missing = await api(other, "/api/support/tickets/missing-fixture");
    assert.equal(foreign.status, 404);
    assert.equal(await foreign.text(), await missing.text());
    assert.equal((await api(editor, "/api/admin/support/tickets")).status, 403);
    const replied = await checked(
      await api(support, `/api/admin/support/tickets/${id}`, "POST", {
        version: 1,
        message: "First fixture staff reply",
      }),
      201,
    );
    assert.equal(replied.ticket.status, "WAITING_USER");
    assert.ok(replied.ticket.firstRespondedAt);
    assert.equal(replied.ticket.responseDueAt, null);
    const firstAt = replied.ticket.firstRespondedAt;
    assert.equal(
      (
        await api(owner, `/api/support/tickets/${id}`, "POST", {
          version: 1,
          message: "stale reply",
        })
      ).status,
      409,
    );
    const reopened = await checked(
      await api(owner, `/api/support/tickets/${id}`, "POST", {
        version: 2,
        message: "Owner follow-up fixture",
      }),
      201,
    );
    assert.equal(reopened.ticket.status, "OPEN");
    assert.ok(reopened.ticket.responseDueAt);
    assert.equal(reopened.ticket.firstRespondedAt, firstAt);
    const thread = await checked(
      await api(owner, `/api/support/tickets/${id}`),
      200,
    );
    assert.equal(thread.messages.length, 3);
    const auditRows = await db.auditLog.findMany({ where: { entityId: id } });
    assert.ok(
      !JSON.stringify(auditRows).includes("Private fixture support message"),
    );
  });
  it("changes roles with optimistic versions, revokes target sessions and protects superadmins", async () => {
    const target = await actor();
    assert.equal((await api(support, "/api/admin/users")).status, 403);
    assert.equal(
      (
        await api(staff, `/api/admin/users/${superadmin.id}`, "PATCH", {
          role: "USER",
          authVersion: 0,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(staff, `/api/admin/users/${staff.id}`, "PATCH", {
          role: "USER",
          authVersion: 0,
        })
      ).status,
      403,
    );
    const changed = await checked(
      await api(staff, `/api/admin/users/${target.id}`, "PATCH", {
        role: "SUPPORT",
        authVersion: 0,
      }),
      200,
    );
    assert.equal(changed.item.role, "SUPPORT");
    assert.equal(changed.item.authVersion, 1);
    assert.equal((await api(target, "/api/account/billing")).status, 401);
    assert.equal(
      (
        await api(staff, `/api/admin/users/${target.id}`, "PATCH", {
          role: "ADMIN",
          authVersion: 0,
        })
      ).status,
      409,
    );
    assert.ok(
      !(await (await api(staff, "/api/admin/users")).text()).includes(
        "@example.invalid",
      ),
    );
  });
  it("bounds chunked request streams without relying on Content-Length", async () => {
    const owner = await actor();
    async function chunked(who: Actor | null, path: string, size: number) {
      return new Promise<number>((done, reject) => {
        const request = httpRequest(
          `${base}${path}`,
          {
            method: "POST",
            headers: {
              origin: base,
              "content-type": "application/json",
              "transfer-encoding": "chunked",
              ...(who ? { cookie: who.cookie, "x-account-id": who.id } : {}),
            },
          },
          (response) => {
            response.resume();
            response.on("end", () => done(response.statusCode!));
          },
        );
        request.on("error", reject);
        request.write(" ".repeat(size));
        request.end();
      });
    }
    assert.equal(await chunked(owner, "/api/checkout", 5000), 413);
    assert.equal(await chunked(owner, "/api/support/tickets", 33000), 413);
    assert.equal(await chunked(null, "/api/webhooks/payments", 33000), 413);
  });
  it("rechecks a queued checkout after the owner's access is revoked", async () => {
    const owner = await actor();
    const calls = initCalls;
    let waiting: Promise<Response> | undefined;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${owner.id} FOR UPDATE`;
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        waiting = api(
          owner,
          "/api/checkout",
          "POST",
          { planCode: "default_1" },
          { "idempotency-key": randomUUID() },
        );
        await waitUntil(async () => {
          const [{ blocked }] = await db.$queryRaw<
            Array<{ blocked: boolean }>
          >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
          return blocked;
        });
        await tx.user.update({
          where: { id: owner.id },
          data: { authVersion: { increment: 1 } },
        });
      },
      { timeout: 25000 },
    );
    assert.equal((await waiting!).status, 401);
    assert.equal(initCalls, calls);
    assert.equal(await db.payment.count({ where: { userId: owner.id } }), 0);
  });
  it("paginates legacy orders without inventing checkout conditions or issuing access", async () => {
    const owner = await actor();
    const product = await db.product.findUniqueOrThrow({
      where: { code: "default_1" },
    });
    await db.payment.createMany({
      data: Array.from({ length: 21 }, () => ({
        userId: owner.id,
        productId: product.id,
        idempotencyKey: randomUUID(),
        amount: 100,
        status: "PENDING" as const,
        description: "Historical fixture description",
      })),
    });
    const first = await checked(await api(owner, "/api/account/billing"), 200);
    assert.equal(first.items.length, 20);
    assert.ok(first.nextCursor);
    assert.deepEqual(first.entitlements, []);
    const second = await checked(
      await api(owner, `/api/account/billing?cursor=${first.nextCursor}`),
      200,
    );
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set([...first.items, ...second.items].map((row) => row.id)).size,
      21,
    );
    const legacy = await db.payment.findUniqueOrThrow({
      where: { id: first.items[0].id },
    });
    assert.equal(legacy.initStatus, "LEGACY");
    assert.equal(legacy.checkoutDurationDays, null);
    assert.equal(legacy.checkoutEntitlements, null);
    assert.equal(legacy.needsReview, true);
    await checked(
      await api(staff, `/api/admin/billing/${legacy.id}`, "POST", {
        action: "reconcile",
        key: randomUUID(),
      }),
      409,
    );
    assert.equal(
      await db.paymentGrant.count({ where: { paymentId: legacy.id } }),
      0,
    );
  });
  it("pins message pagination to a thread version and preserves unknown legacy deadlines", async () => {
    const owner = await actor();
    const ticket = await db.supportTicket.create({
      data: {
        userId: owner.id,
        subject: "Legacy fixture thread",
        category: "OTHER",
        messages: {
          create: Array.from({ length: 22 }, (_, index) => ({
            authorId: owner.id,
            body: `Historical fixture ${index}`,
          })),
        },
      },
    });
    const first = await checked(
      await api(owner, `/api/support/tickets/${ticket.id}`),
      200,
    );
    assert.equal(first.messages.length, 20);
    assert.equal(first.hasMore, true);
    assert.equal(first.ticket.responseDueAt, null);
    assert.equal(first.ticket.firstRespondedAt, null);
    const second = await checked(
      await api(owner, `/api/support/tickets/${ticket.id}?page=2&version=1`),
      200,
    );
    assert.equal(second.messages.length, 2);
    assert.equal(
      new Set([...first.messages, ...second.messages].map((row) => row.id))
        .size,
      22,
    );
    await checked(
      await api(owner, `/api/support/tickets/${ticket.id}`, "POST", {
        version: 1,
        message: "New fixture reply",
      }),
      201,
    );
    assert.equal(
      (await api(owner, `/api/support/tickets/${ticket.id}?page=2&version=1`))
        .status,
      409,
    );
  });
});
