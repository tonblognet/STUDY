"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./billing.module.css";

export type BillingItem = {
  id: string;
  productName: string;
  amount: number;
  currency: string;
  status: string;
  attemptState: string;
  needsReview: boolean;
  environment: string;
  createdAt: string | Date;
  confirmedAt: string | Date | null;
  refundedAt: string | Date | null;
  resumeUrl?: string | null;
};
export const paymentLabels: Record<string, string> = {
  PENDING: "Ожидает подтверждения",
  SUCCEEDED: "Оплата подтверждена",
  FAILED: "Оплата не состоялась",
  REFUNDED: "Возврат подтверждён",
  PARTIALLY_REFUNDED: "Частичный возврат",
};
export function formatPaymentAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
    amount / 100,
  );
}
function date(value: string | Date) {
  return new Date(
    typeof value === "string" ? value : value.getTime(),
  ).toLocaleString("ru-RU");
}

export function BillingHistory({
  accountId,
  initial,
}: {
  accountId: string;
  initial: {
    items: BillingItem[];
    nextCursor: string | null;
    entitlements: string[];
  };
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(more = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/account/billing${more && data.nextCursor ? `?cursor=${encodeURIComponent(data.nextCursor)}` : ""}`,
        { cache: "no-store", headers: { "x-account-id": accountId } },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось загрузить платежи.");
      setData({
        ...result,
        items: more ? [...data.items, ...result.items] : result.items,
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Повторите позже.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-busy={busy} className={styles.section}>
      <p>
        Возвращение с банковской страницы само по себе не подтверждает оплату.
        Здесь показан сохранённый результат проверки.
      </p>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Обновляем…" : "Обновить платежи"}
      </button>
      {error && <p role="alert">{error}</p>}
      <h2>Действующий доступ</h2>
      <p>
        {data.entitlements.includes("admission_full_data")
          ? "Доступ Default активен."
          : "Подтверждённого платного доступа сейчас нет."}
      </p>
      <h2>История платежей</h2>
      {!data.items.length && (
        <div className="empty-state">
          <strong>Платежей пока нет</strong>
          <p>После первой попытки оплаты её результат появится здесь.</p>
          <Link href="/pricing">Посмотреть тарифы</Link>
        </div>
      )}
      <div className={styles.list}>
        {data.items.map((payment) => (
          <article className={styles.card} key={payment.id}>
            <div className={styles.heading}>
              <h3>{payment.productName}</h3>
              <strong>
                {formatPaymentAmount(payment.amount, payment.currency)}
              </strong>
            </div>
            <p>{paymentLabels[payment.status] ?? "Требуется проверка"}</p>
            {payment.resumeUrl && (
              <p>
                <a href={payment.resumeUrl} rel="noreferrer">
                  Продолжить оплату
                </a>
              </p>
            )}
            {payment.environment === "sandbox" && (
              <p>Тестовый платёж: платный доступ не активируется.</p>
            )}
            {payment.needsReview && (
              <p>
                Результат требует сверки.{" "}
                <Link href="/support#history">Связаться с поддержкой</Link>
              </p>
            )}
            <dl className={styles.details}>
              <div>
                <dt>Номер платежа</dt>
                <dd>{payment.id}</dd>
              </div>
              <div>
                <dt>Попытка создана</dt>
                <dd>{date(payment.createdAt)}</dd>
              </div>
              {payment.confirmedAt && (
                <div>
                  <dt>Подтверждение получено</dt>
                  <dd>{date(payment.confirmedAt)}</dd>
                </div>
              )}
              {payment.refundedAt && (
                <div>
                  <dt>Возврат подтверждён</dt>
                  <dd>{date(payment.refundedAt)}</dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
      {data.nextCursor && (
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Показать ещё
        </button>
      )}
    </section>
  );
}
