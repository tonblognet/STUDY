import { randomBytes } from "node:crypto";
import { Prisma, type Payment, type Role } from "@prisma/client";
import { prisma } from "@/db";
import {
  readActiveSession,
  withActiveSession,
  type ActiveSession,
} from "@/lib/auth/session-access";
import {
  buildReceipt,
  getBankConfiguration,
  getCheckoutSettings,
  type BankConfiguration,
} from "./config";
import { BillingError } from "./errors";
import { decidePaymentTransition } from "./state";
import type { PaymentNotification } from "./notification";
import {
  cancelTbankPayment,
  checkTbankOrder,
  customerKey,
  getTbankPaymentState,
  initTbankPayment,
  isTrustedPaymentUrl,
  TbankProtocolError,
} from "./tbank";

const staffRoles: Role[] = ["ADMIN", "SUPERADMIN"];
type Tx = Prisma.TransactionClient;
type Principal = { access: ActiveSession; staff?: boolean };
type Evidence = {
  TerminalKey: string;
  OrderId: string;
  PaymentId: string;
  Status: string;
  Amount?: number;
};
const includeGrant = { grant: { include: { subscription: true } } } as const;
type LockedPayment = Prisma.PaymentGetPayload<{ include: typeof includeGrant }>;
const missing = () =>
  new BillingError(404, "PAYMENT_NOT_FOUND", "Платёж не найден.");
const expired = () =>
  new BillingError(401, "SESSION_EXPIRED", "Сессия истекла. Войдите снова.");
const review = () =>
  new BillingError(
    409,
    "RECONCILIATION_REQUIRED",
    "Результат требует сверки. Обратитесь в поддержку с номером платежа.",
  );

/** All financial writers lock owners before Payment, including bank events.
 * This also prevents FK checks during grant creation from inverting User locks.
 */
async function withLockedPayment<T>(
  id: string,
  principal: Principal | undefined,
  act: (tx: Tx, payment: LockedPayment) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const hint = await tx.payment.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!hint) throw missing();
    const ids = [
      ...new Set([
        hint.userId,
        ...(principal ? [principal.access.user.id] : []),
      ]),
    ].sort();
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    if (principal) {
      const current = await readActiveSession(
        { id: principal.access.id, userId: principal.access.user.id },
        tx,
      );
      if (!current) throw expired();
      if (
        principal.staff
          ? !staffRoles.includes(current.user.role)
          : current.user.id !== hint.userId
      )
        throw missing();
    }
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${id} FOR UPDATE`;
    const payment = await tx.payment.findUnique({
      where: { id },
      include: includeGrant,
    });
    if (!payment) throw missing();
    return act(tx, payment);
  });
}

function assertBank(payment: Payment, bank: BankConfiguration) {
  if (
    payment.terminalKey !== bank.terminalKey ||
    payment.providerEnvironment !== bank.environment
  )
    throw review();
}
function snapshotKeys(payment: Payment): string[] | null {
  const value = payment.checkoutEntitlements;
  return Array.isArray(value) &&
    value.length <= 50 &&
    value.every(
      (key) => typeof key === "string" && /^[a-z0-9_]{1,80}$/.test(key),
    )
    ? (value as string[])
    : null;
}
function completeSnapshot(payment: Payment) {
  return (
    !!payment.checkoutProductCode &&
    !!payment.checkoutProductName &&
    !!payment.checkoutDurationDays &&
    payment.checkoutDurationDays > 0 &&
    payment.checkoutDurationDays <= 3660 &&
    snapshotKeys(payment) !== null
  );
}
async function audit(
  tx: Tx,
  paymentId: string,
  action: string,
  actorId: string | null,
  after: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType: "Payment",
      entityId: paymentId,
      after,
    },
  });
}

async function applyEvidence(
  tx: Tx,
  payment: LockedPayment,
  evidence: Evidence,
  source: string,
) {
  const refund = ["REFUNDED", "PARTIAL_REFUNDED"].includes(evidence.Status);
  const identityMatches =
    payment.terminalKey === evidence.TerminalKey &&
    payment.id === evidence.OrderId &&
    (!payment.providerPaymentId ||
      payment.providerPaymentId === evidence.PaymentId);
  // Refund Amount has no assumed delta/cumulative meaning. Identity is the
  // authenticated terminal + order + bank ID; confirmation still matches cents.
  if (
    !identityMatches ||
    (!refund && evidence.Amount !== payment.amount) ||
    payment.initStatus === "LEGACY"
  ) {
    await tx.payment.update({
      where: { id: payment.id },
      data: { needsReview: true },
    });
    return {
      accepted: false,
      payment: await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      }),
    };
  }
  if (!payment.providerPaymentId) {
    const claim = await tx.paymentOperation.findFirst({
      where: { paymentId: payment.id, kind: "INIT" },
    });
    if (!claim || !completeSnapshot(payment))
      return { accepted: false, payment };
  }
  const transition = decidePaymentTransition(payment.status, evidence.Status);
  const now = new Date();
  let subscriptionId = payment.subscriptionId;
  let needsReview =
    payment.needsReview ||
    transition.needsReview ||
    evidence.Status === "PARTIAL_REFUNDED";
  if (transition.grant) {
    if (!completeSnapshot(payment)) needsReview = true;
    else if (!payment.grant) {
      const otherActive = await tx.paymentGrant.findFirst({
        where: {
          paymentId: { not: payment.id },
          revokedAt: null,
          payment: {
            userId: payment.userId,
            providerEnvironment: payment.providerEnvironment,
            status: "SUCCEEDED",
          },
          subscription: { status: "ACTIVE", currentPeriodEnd: { gt: now } },
        },
        select: { paymentId: true },
      });
      if (otherActive) needsReview = true;
      else {
        // A unique PaymentGrant.paymentId is the second line of defense after
        // the owner/payment lock. Everything rolls back if the grant/audit fails.
        const subscription = await tx.subscription.create({
          data: {
            userId: payment.userId,
            productId: payment.productId,
            provider: "tbank",
            planCode: payment.checkoutProductCode!,
            status: "ACTIVE",
            autoRenew: false,
            currentPeriodEnd: new Date(
              now.getTime() + payment.checkoutDurationDays! * 86400000,
            ),
          },
        });
        await tx.paymentGrant.create({
          data: {
            paymentId: payment.id,
            subscriptionId: subscription.id,
            entitlementKeys: snapshotKeys(payment)!,
            issuedAt: now,
          },
        });
        subscriptionId = subscription.id;
      }
    }
  }
  if (transition.revoke && payment.grant && !payment.grant.revokedAt) {
    await tx.paymentGrant.update({
      where: { paymentId: payment.id },
      data: { revokedAt: now },
    });
    await tx.subscription.update({
      where: { id: payment.grant.subscriptionId },
      data: { status: "CANCELED", canceledAt: now, autoRenew: false },
    });
  }
  const saved = await tx.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: evidence.PaymentId,
      status: transition.status,
      ...(transition.changed || payment.status === "PENDING"
        ? { providerStatus: evidence.Status }
        : {}),
      ...(transition.status === "SUCCEEDED" && !payment.paidAt
        ? { paidAt: now }
        : {}),
      ...(transition.status === "REFUNDED" && !payment.refundedAt
        ? { refundedAt: now }
        : {}),
      subscriptionId,
      needsReview,
      version: { increment: 1 },
    },
  });
  if (transition.changed || transition.needsReview)
    await audit(tx, payment.id, "PAYMENT_BANK_STATE", null, {
      source,
      providerStatus: evidence.Status,
      previous: payment.status,
      current: saved.status,
    });
  if (saved.status === "REFUNDED")
    await tx.paymentOperation.updateMany({
      where: {
        paymentId: payment.id,
        kind: "REFUND",
        state: { in: ["IN_FLIGHT", "UNKNOWN"] },
      },
      data: { state: "SUCCEEDED", leaseUntil: null, resultCode: "REFUNDED" },
    });
  return { accepted: true, payment: saved };
}

export function paymentView(payment: Payment) {
  return {
    id: payment.id,
    productCode: payment.checkoutProductCode,
    productName: payment.checkoutProductName ?? "Исторический платёж",
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    attemptState: payment.initStatus,
    needsReview: payment.needsReview,
    environment: payment.providerEnvironment,
    createdAt: payment.createdAt,
    confirmedAt: payment.paidAt,
    refundedAt: payment.refundedAt,
  };
}
async function checkoutResult(payment: Payment) {
  const grant =
    payment.status === "SUCCEEDED"
      ? await prisma.paymentGrant.findUnique({
          where: { paymentId: payment.id },
          include: { subscription: true },
        })
      : null;
  return {
    payment: paymentView(payment),
    canStartNewAttempt:
      payment.status === "FAILED" ||
      payment.status === "REFUNDED" ||
      payment.initStatus === "REJECTED" ||
      (payment.status === "SUCCEEDED" &&
        !!grant &&
        !!grant.subscription.currentPeriodEnd &&
        grant.subscription.currentPeriodEnd <= new Date()),
    ...(payment.status === "PENDING" &&
    payment.initStatus === "READY" &&
    !payment.needsReview &&
    payment.paymentUrl &&
    isTrustedPaymentUrl(payment.paymentUrl)
      ? { paymentUrl: payment.paymentUrl }
      : {}),
  };
}

export async function startCheckout(
  access: ActiveSession,
  planCode: string,
  idempotencyKey: string,
) {
  const settings = getCheckoutSettings();
  if (!settings.enabledProducts.has(planCode))
    throw new BillingError(404, "PLAN_UNAVAILABLE", "Тариф пока недоступен.");
  const claimed = await withActiveSession(access, async (tx) => {
    const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (
        existing.userId !== access.user.id ||
        existing.checkoutProductCode !== planCode
      )
        throw new BillingError(
          409,
          "ATTEMPT_CONFLICT",
          "Не удалось повторить эту попытку оплаты. Обновите страницу.",
        );
      if (existing.initStatus === "IN_FLIGHT") {
        const operation = await tx.paymentOperation.findFirst({
          where: { paymentId: existing.id, kind: "INIT" },
        });
        if (!operation?.leaseUntil || operation.leaseUntil <= new Date()) {
          await tx.paymentOperation.updateMany({
            where: { paymentId: existing.id, kind: "INIT", state: "IN_FLIGHT" },
            data: {
              state: "UNKNOWN",
              leaseUntil: null,
              resultCode: "LEASE_EXPIRED",
            },
          });
          return {
            payment: await tx.payment.update({
              where: { id: existing.id },
              data: {
                initStatus: "UNKNOWN",
                needsReview: existing.status === "PENDING",
              },
            }),
            operation: null,
          };
        }
      }
      return { payment: existing, operation: null };
    }
    const active = await tx.paymentGrant.findFirst({
      where: {
        revokedAt: null,
        payment: {
          userId: access.user.id,
          providerEnvironment: settings.environment,
          status: "SUCCEEDED",
        },
        subscription: {
          status: "ACTIVE",
          currentPeriodEnd: { gt: new Date() },
        },
      },
      select: { paymentId: true },
    });
    if (active)
      throw new BillingError(
        409,
        "ACCESS_ACTIVE",
        "У вас уже есть действующий доступ. Следующая оплата доступна после окончания его срока.",
      );
    const pending = await tx.payment.findFirst({
      where: {
        userId: access.user.id,
        providerEnvironment: settings.environment,
        status: "PENDING",
        initStatus: { in: ["NEW", "IN_FLIGHT", "READY", "UNKNOWN"] },
      },
      select: { id: true },
    });
    if (pending)
      throw new BillingError(
        409,
        "CHECKOUT_PENDING",
        "Предыдущая попытка оплаты ещё не завершена. Проверьте историю платежей или обратитесь в поддержку.",
      );
    const product = await tx.product.findFirst({
      where: { code: planCode, active: true, purchasable: true },
      include: { entitlements: { include: { entitlement: true } } },
    });
    if (
      !product ||
      product.currency !== "RUB" ||
      !Number.isSafeInteger(product.price) ||
      product.price <= 0 ||
      !product.durationDays ||
      product.durationDays < 1 ||
      product.durationDays > 3660
    )
      throw new BillingError(404, "PLAN_UNAVAILABLE", "Тариф пока недоступен.");
    buildReceipt(
      settings,
      { name: product.name, amount: product.price },
      access.user.email,
    );
    const keys = product.entitlements.map((row) => row.entitlement.key);
    if (keys.length > 50 || keys.some((key) => !/^[a-z0-9_]{1,80}$/.test(key)))
      throw new BillingError(
        503,
        "PLAN_CONFIGURATION",
        "Оплата пока недоступна.",
      );
    // Upsert serializes a global-key collision with another owner without
    // leaking or calling Init for that owner's order.
    const payment = await tx.payment.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        userId: access.user.id,
        productId: product.id,
        idempotencyKey,
        amount: product.price,
        currency: product.currency,
        status: "PENDING",
        initStatus: "NEW",
        needsReview: false,
        terminalKey: settings.terminalKey,
        providerEnvironment: settings.environment,
        checkoutProductCode: product.code,
        checkoutProductName: product.name,
        checkoutDurationDays: product.durationDays,
        checkoutEntitlements: keys,
      },
    });
    if (
      payment.userId !== access.user.id ||
      payment.checkoutProductCode !== planCode
    )
      throw new BillingError(
        409,
        "ATTEMPT_CONFLICT",
        "Не удалось повторить эту попытку оплаты.",
      );
    if (payment.initStatus !== "NEW") return { payment, operation: null };
    const operation = await tx.paymentOperation.create({
      data: {
        paymentId: payment.id,
        kind: "INIT",
        idempotencyKey,
        leaseUntil: new Date(Date.now() + 30000),
      },
    });
    const saved = await tx.payment.update({
      where: { id: payment.id },
      data: { initStatus: "IN_FLIGHT" },
    });
    await audit(tx, payment.id, "PAYMENT_INIT_CLAIMED", access.user.id, {
      operationId: operation.id,
      productCode: product.code,
      amount: product.price,
    });
    return { payment: saved, operation };
  });
  if (!claimed) throw expired();
  const { payment, operation } = claimed.value;
  if (!operation) return checkoutResult(payment);
  try {
    const result = await initTbankPayment(
      {
        TerminalKey: settings.terminalKey,
        Amount: payment.amount,
        OrderId: payment.id,
        Description: payment.checkoutProductName!,
        CustomerKey: customerKey(payment.userId),
        PayType: "O",
        NotificationURL: settings.notificationUrl,
        SuccessURL: `${settings.appUrl}/account/billing?payment=return`,
        FailURL: `${settings.appUrl}/account/billing?payment=return`,
        DATA: { OperationInitiatorType: "0" },
        Receipt: buildReceipt(
          settings,
          { name: payment.checkoutProductName!, amount: payment.amount },
          access.user.email,
        ),
      },
      settings,
    );
    const applied = await withLockedPayment(
      payment.id,
      undefined,
      async (tx, current) => {
        assertBank(current, settings);
        const observed = await applyEvidence(tx, current, result, "init");
        if (!observed.accepted) {
          await tx.paymentOperation.update({
            where: { id: operation.id },
            data: {
              state: "UNKNOWN",
              leaseUntil: null,
              resultCode: "IDENTITY_MISMATCH",
            },
          });
          return observed.payment;
        }
        await tx.paymentOperation.update({
          where: { id: operation.id },
          data: {
            state: "SUCCEEDED",
            leaseUntil: null,
            resultCode: "INIT_ACCEPTED",
          },
        });
        return tx.payment.update({
          where: { id: payment.id },
          data: { initStatus: "READY", paymentUrl: result.PaymentURL },
        });
      },
    );
    return checkoutResult(applied);
  } catch (error) {
    const saved = await withLockedPayment(
      payment.id,
      undefined,
      async (tx, current) => {
        const rejected =
          error instanceof TbankProtocolError &&
          error.rejected &&
          !current.providerPaymentId;
        await tx.paymentOperation.updateMany({
          where: { id: operation.id, state: "IN_FLIGHT" },
          data: {
            state:
              current.status === "SUCCEEDED"
                ? "SUCCEEDED"
                : rejected
                  ? "REJECTED"
                  : "UNKNOWN",
            leaseUntil: null,
            resultCode: rejected ? "BANK_REJECTED" : "INIT_UNCERTAIN",
          },
        });
        const payment = await tx.payment.update({
          where: { id: current.id },
          data: {
            initStatus: rejected ? "REJECTED" : "UNKNOWN",
            needsReview: current.status === "PENDING" && !rejected,
          },
        });
        await audit(tx, current.id, "PAYMENT_INIT_RESULT", null, {
          operationId: operation.id,
          result: payment.initStatus,
        });
        return payment;
      },
    );
    return checkoutResult(saved);
  }
}

export async function receiveBankNotification(
  notification: PaymentNotification,
  bank: BankConfiguration,
) {
  return withLockedPayment(
    notification.OrderId,
    undefined,
    async (tx, payment) => {
      assertBank(payment, bank);
      return applyEvidence(tx, payment, notification, "webhook");
    },
  );
}

export async function reconcilePayment(
  access: ActiveSession,
  id: string,
  key: string,
) {
  const bank = getBankConfiguration();
  const claimed = await withLockedPayment(
    id,
    { access, staff: true },
    async (tx, payment) => {
      assertBank(payment, bank);
      const operation = await tx.paymentOperation.upsert({
        where: {
          paymentId_kind_idempotencyKey: {
            paymentId: id,
            kind: "RECONCILE",
            idempotencyKey: key,
          },
        },
        update: {},
        create: {
          paymentId: id,
          kind: "RECONCILE",
          idempotencyKey: key,
          leaseUntil: new Date(Date.now() + 30000),
        },
      });
      await audit(tx, id, "PAYMENT_RECONCILE_REQUESTED", access.user.id, {
        operationId: operation.id,
      });
      return { payment, operation };
    },
  );
  try {
    let evidence: Evidence;
    if (claimed.payment.providerPaymentId)
      evidence = await getTbankPaymentState(
        claimed.payment.providerPaymentId,
        bank,
      );
    else {
      const order = await checkTbankOrder(id, bank);
      if (
        order.Payments.length !== 1 ||
        order.Payments[0].Amount !== claimed.payment.amount
      )
        throw review();
      evidence = {
        ...order.Payments[0],
        TerminalKey: order.TerminalKey,
        OrderId: order.OrderId,
      };
    }
    return await withLockedPayment(id, undefined, async (tx, payment) => {
      assertBank(payment, bank);
      const applied = await applyEvidence(tx, payment, evidence, "reconcile");
      const known = applied.accepted && completeSnapshot(payment);
      await tx.paymentOperation.update({
        where: { id: claimed.operation.id },
        data: {
          state: known ? "SUCCEEDED" : "UNKNOWN",
          leaseUntil: null,
          resultCode: known ? "STATE_OBSERVED" : "REVIEW_REQUIRED",
        },
      });
      const missingUrl =
        applied.payment.status === "PENDING" && !payment.paymentUrl;
      const missingGrant =
        applied.payment.status === "SUCCEEDED" &&
        !(await tx.paymentGrant.findUnique({
          where: { paymentId: id },
          select: { paymentId: true },
        }));
      return paymentView(
        await tx.payment.update({
          where: { id },
          data: {
            needsReview:
              !known ||
              missingUrl ||
              missingGrant ||
              applied.payment.status === "PARTIALLY_REFUNDED",
            ...(payment.initStatus === "IN_FLIGHT"
              ? { initStatus: payment.paymentUrl ? "READY" : "UNKNOWN" }
              : {}),
          },
        }),
      );
    });
  } catch {
    await withLockedPayment(id, undefined, async (tx) => {
      await tx.paymentOperation.update({
        where: { id: claimed.operation.id },
        data: {
          state: "UNKNOWN",
          leaseUntil: null,
          resultCode: "REVIEW_REQUIRED",
        },
      });
      await tx.payment.update({ where: { id }, data: { needsReview: true } });
    });
    throw review();
  }
}

export async function requestFullRefund(
  access: ActiveSession,
  id: string,
  key: string,
) {
  const bank = getBankConfiguration();
  const claimed = await withLockedPayment(
    id,
    { access, staff: true },
    async (tx, payment) => {
      assertBank(payment, bank);
      const previous = await tx.paymentOperation.findFirst({
        where: { paymentId: id, kind: "REFUND" },
        orderBy: { createdAt: "asc" },
      });
      if (previous && previous.idempotencyKey !== key)
        throw new BillingError(
          409,
          "REFUND_ATTEMPT_EXISTS",
          "У возврата уже есть попытка. Используйте её повтор или сверку.",
        );
      if (payment.status === "REFUNDED" || previous?.state === "SUCCEEDED")
        return { payment, operation: previous, callBank: false };
      if (
        payment.status !== "SUCCEEDED" ||
        !payment.providerPaymentId ||
        !completeSnapshot(payment)
      )
        throw review();
      if (
        previous?.state === "IN_FLIGHT" &&
        previous.leaseUntil &&
        previous.leaseUntil > new Date()
      )
        return { payment, operation: previous, callBank: false };
      if (previous?.state === "REJECTED") throw review();
      const operation = previous
        ? await tx.paymentOperation.update({
            where: { id: previous.id },
            data: {
              state: "IN_FLIGHT",
              leaseUntil: new Date(Date.now() + 30000),
            },
          })
        : await tx.paymentOperation.create({
            data: {
              paymentId: id,
              kind: "REFUND",
              idempotencyKey: key,
              externalRequestId: randomBytes(15).toString("hex"),
              leaseUntil: new Date(Date.now() + 30000),
            },
          });
      await audit(tx, id, "PAYMENT_REFUND_REQUESTED", access.user.id, {
        operationId: operation.id,
        amount: payment.amount,
      });
      return { payment, operation, callBank: true };
    },
  );
  if (!claimed.callBank || !claimed.operation)
    return {
      payment: paymentView(claimed.payment),
      operation: claimed.operation?.state ?? null,
    };
  try {
    const result = await cancelTbankPayment(
      {
        paymentId: claimed.payment.providerPaymentId!,
        externalRequestId: claimed.operation.externalRequestId!,
      },
      bank,
    );
    return await withLockedPayment(id, undefined, async (tx, payment) => {
      assertBank(payment, bank);
      const applied = await applyEvidence(
        tx,
        payment,
        { ...result, OrderId: id, Amount: payment.amount },
        "refund",
      );
      const completed =
        applied.accepted && applied.payment.status === "REFUNDED";
      await tx.paymentOperation.update({
        where: { id: claimed.operation!.id },
        data: {
          state: completed ? "SUCCEEDED" : "UNKNOWN",
          leaseUntil: null,
          resultCode: completed ? "REFUNDED" : "AWAITING_REFUND",
        },
      });
      if (!completed)
        await tx.payment.update({ where: { id }, data: { needsReview: true } });
      return {
        payment: paymentView(applied.payment),
        operation: completed ? "SUCCEEDED" : "UNKNOWN",
      };
    });
  } catch (error) {
    return withLockedPayment(id, undefined, async (tx, payment) => {
      // A webhook may have settled while Cancel's response was lost.
      const completed = payment.status === "REFUNDED";
      const rejected =
        !completed && error instanceof TbankProtocolError && error.rejected;
      const state = completed ? "SUCCEEDED" : rejected ? "REJECTED" : "UNKNOWN";
      await tx.paymentOperation.update({
        where: { id: claimed.operation!.id },
        data: {
          state,
          leaseUntil: null,
          resultCode: completed
            ? "REFUNDED"
            : rejected
              ? "BANK_REJECTED"
              : "REFUND_UNCERTAIN",
        },
      });
      const saved = await tx.payment.update({
        where: { id },
        data: { needsReview: !completed },
      });
      return { payment: paymentView(saved), operation: state };
    });
  }
}

export async function getAccountBilling(userId: string, cursor?: string) {
  if (
    cursor &&
    !(await prisma.payment.findFirst({
      where: { id: cursor, userId },
      select: { id: true },
    }))
  )
    throw new BillingError(400, "INVALID_CURSOR", "Обновите список платежей.");
  const rows = await prisma.payment.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const grants = await prisma.paymentGrant.findMany({
    where: {
      payment: { userId, providerEnvironment: "live", status: "SUCCEEDED" },
      revokedAt: null,
      subscription: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
    },
    select: {
      entitlementKeys: true,
      subscription: { select: { currentPeriodEnd: true } },
    },
    take: 100,
  });
  const entitlements = [
    ...new Set(
      grants.flatMap((grant) =>
        Array.isArray(grant.entitlementKeys)
          ? grant.entitlementKeys.filter(
              (key): key is string => typeof key === "string",
            )
          : [],
      ),
    ),
  ];
  return {
    items: rows.slice(0, 20).map((payment) => ({
      ...paymentView(payment),
      resumeUrl:
        payment.status === "PENDING" &&
        payment.initStatus === "READY" &&
        !payment.needsReview &&
        payment.paymentUrl &&
        isTrustedPaymentUrl(payment.paymentUrl)
          ? payment.paymentUrl
          : null,
    })),
    nextCursor: rows.length > 20 ? rows[19].id : null,
    entitlements,
  };
}

export async function getAdminBilling(access: ActiveSession, page: number) {
  const result = await withActiveSession(access, async (tx) => {
    const current = await readActiveSession(
      { id: access.id, userId: access.user.id },
      tx,
    );
    if (!current || !staffRoles.includes(current.user.role))
      throw new BillingError(403, "ROLE", "Доступ запрещён.");
    const rows = await tx.payment.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      skip: (page - 1) * 20,
      include: {
        operations: {
          where: { kind: "REFUND" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { idempotencyKey: true, state: true },
        },
      },
    });
    return {
      items: rows.slice(0, 20).map((payment) => ({
        ...paymentView(payment),
        refundAttempt: payment.operations[0] ?? null,
      })),
      page,
      hasNext: rows.length > 20,
    };
  });
  if (!result) throw expired();
  return result.value;
}
