"use client";
import { useState } from "react";
import {
  formatPaymentAmount,
  paymentLabels,
  type BillingItem,
} from "./billing-history";
import styles from "./billing.module.css";

type StaffPayment = BillingItem & {
  refundAttempt: { idempotencyKey: string; state: string } | null;
};
type StaffList = { items: StaffPayment[]; page: number; hasNext: boolean };
const refundLabels: Record<string, string> = {
  IN_FLIGHT: "Отправлена банку",
  UNKNOWN: "Требует сверки",
  SUCCEEDED: "Подтверждена",
  REJECTED: "Отклонена банком",
};
export function AdminBilling({
  accountId,
  initial,
}: {
  accountId: string;
  initial: StaffList;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  async function refresh(page = data.page) {
    const response = await fetch(`/api/admin/billing?page=${page}`, {
      cache: "no-store",
      headers: { "x-account-id": accountId },
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Не удалось загрузить платежи.");
    setData(result);
  }
  async function run(payment: StaffPayment, action: "reconcile" | "refund") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/billing/${payment.id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-account-id": accountId,
        },
        body: JSON.stringify({
          action,
          key:
            action === "refund"
              ? (payment.refundAttempt?.idempotencyKey ??
                `refund_${payment.id}`)
              : crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Команда не выполнена.");
      setNotice(
        action === "reconcile"
          ? "Состояние платежа сверено."
          : result.payment.status === "REFUNDED"
            ? "Банк подтвердил полный возврат."
            : "Попытка возврата сохранена. Дождитесь подтверждения или выполните сверку.",
      );
      setConfirm(null);
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Повторите позже.");
    } finally {
      setBusy(false);
    }
  }
  async function changePage(page: number) {
    setBusy(true);
    setError("");
    try {
      await refresh(page);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Повторите позже.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.section} aria-busy={busy}>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => void changePage(data.page)}
      >
        Обновить платежи
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data.items.length && (
        <div className="empty-state">
          <strong>Платежей пока нет</strong>
        </div>
      )}
      <div className={styles.list}>
        {data.items.map((payment) => (
          <article className={styles.card} key={payment.id}>
            <div className={styles.heading}>
              <h2>{payment.productName}</h2>
              <strong>
                {formatPaymentAmount(payment.amount, payment.currency)}
              </strong>
            </div>
            <p>
              {paymentLabels[payment.status] ?? payment.status} ·{" "}
              {payment.environment === "sandbox"
                ? "Тестовый"
                : payment.environment === "legacy"
                  ? "Исторический"
                  : "Боевой"}
            </p>
            <p className={styles.identifier}>Номер: {payment.id}</p>
            {payment.needsReview && <p>Требуется сверка.</p>}
            {payment.refundAttempt && (
              <p>
                Попытка возврата:{" "}
                {refundLabels[payment.refundAttempt.state] ??
                  "Требует проверки"}
              </p>
            )}
            {payment.refundAttempt?.state === "REJECTED" && (
              <p>
                Банк отклонил запрос. Проверьте причину и дальнейшее действие в
                кабинете банка, затем выполните сверку здесь.
              </p>
            )}
            <div className={styles.actions}>
              <button
                className="button button-secondary"
                disabled={busy || payment.environment === "legacy"}
                onClick={() => void run(payment, "reconcile")}
              >
                Сверить с банком
              </button>
              {payment.status === "SUCCEEDED" &&
                payment.refundAttempt?.state !== "REJECTED" && (
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setConfirm(payment.id)}
                  >
                    {payment.refundAttempt
                      ? "Повторить попытку возврата"
                      : "Полный возврат"}
                  </button>
                )}
            </div>
            {confirm === payment.id && (
              <div className={styles.confirm}>
                <p>
                  Вернуть{" "}
                  {formatPaymentAmount(payment.amount, payment.currency)} по
                  платежу {payment.id}? Подтверждённый возврат отключит доступ,
                  выданный этим платежом.
                </p>
                <div className={styles.actions}>
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void run(payment, "refund")}
                  >
                    Подтвердить полный возврат
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      <nav className={styles.actions} aria-label="Страницы платежей">
        <button
          disabled={busy || data.page <= 1}
          onClick={() => void changePage(data.page - 1)}
        >
          Назад
        </button>
        <span>Страница {data.page}</span>
        <button
          disabled={busy || !data.hasNext}
          onClick={() => void changePage(data.page + 1)}
        >
          Далее
        </button>
      </nav>
    </section>
  );
}
