"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type PublicProduct = {
  code: string;
  name: string;
  description: string;
  amountKopecks: number;
  durationMonths: number;
  durationDays?: number | null;
  features: string[];
  purchasable: boolean;
};

const featureLabels: Record<string, string> = {
  admission_full_data: "Полные данные о поступлении",
  ai_level_1_discount: "AI Level 1 за 39 ₽ вместо 79 ₽",
  advanced_tracking: "Расширенный трекер поступления",
  ai_level_1_request: "Одна grounded-рекомендация",
  ai_level_2: "Персональный помощник Level 2",
  ai_level_3: "Level 3 после запуска официальных интеграций",
  premium_notifications: "Расширенные уведомления",
};

export function PricingClient({
  products,
  accountId = null,
  checkoutEnabled = false,
  environment = "live",
}: {
  products: PublicProduct[];
  accountId?: string | null;
  checkoutEnabled?: boolean;
  environment?: "live" | "sandbox";
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const attempts = useRef<Record<string, string>>({});
  const [completedPlan, setCompletedPlan] = useState<string | null>(null);

  function attemptKey(planCode: string) {
    if (attempts.current[planCode]) return attempts.current[planCode];
    const storageKey = `postupai:checkout:${accountId}:${planCode}`;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(storageKey);
    } catch {
      /* Memory keeps retries stable when storage is unavailable. */
    }
    const key =
      saved && /^[a-zA-Z0-9_-]{8,128}$/.test(saved)
        ? saved
        : crypto.randomUUID();
    attempts.current[planCode] = key;
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      /* Optional persistence. */
    }
    return key;
  }
  function newAttempt() {
    if (!completedPlan) return;
    delete attempts.current[completedPlan];
    try {
      sessionStorage.removeItem(
        `postupai:checkout:${accountId}:${completedPlan}`,
      );
    } catch {
      /* Optional persistence. */
    }
    setCompletedPlan(null);
    setMessage("Можно выбрать тариф для новой попытки оплаты.");
  }

  async function checkout(planCode: string) {
    if (!accountId) {
      router.push("/login?returnTo=/pricing");
      return;
    }
    setLoading(planCode);
    setMessage("Проверяем готовность защищённой оплаты…");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": attemptKey(planCode),
          "x-account-id": accountId,
        },
        body: JSON.stringify({ planCode }),
      });
      const result = (await response.json()) as {
        paymentUrl?: string;
        error?: string;
        payment?: {
          status: string;
          attemptState: string;
          needsReview: boolean;
        };
        canStartNewAttempt?: boolean;
      };
      if (response.status === 401) {
        router.push("/login?returnTo=/pricing");
        return;
      }
      if (!response.ok) {
        setMessage(result.error ?? "Оплата пока недоступна.");
        return;
      }
      if (!result.paymentUrl) {
        if (result.canStartNewAttempt) setCompletedPlan(planCode);
        setMessage(
          result.payment?.status === "SUCCEEDED"
            ? "Оплата подтверждена. Проверьте доступ в истории платежей."
            : result.payment?.needsReview
              ? "Результат оплаты требует сверки. Проверьте историю платежей и обратитесь в поддержку."
              : "Попытка оплаты сохранена. Проверьте её результат в истории платежей.",
        );
        return;
      }
      window.location.assign(result.paymentUrl);
    } catch {
      setMessage(
        "Не удалось связаться с платёжным сервисом. Попробуйте позже.",
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="pricing-grid">
        {products.map((product) => (
          <article
            key={product.code}
            className={product.code === "default_12" ? "featured-plan" : ""}
          >
            <span className="plan-name">{product.name}</span>
            <h2>
              {new Intl.NumberFormat("ru-RU").format(
                product.amountKopecks / 100,
              )}{" "}
              ₽
            </h2>
            <p>{product.description}</p>
            {product.durationDays && (
              <p>Срок доступа: {product.durationDays} дней.</p>
            )}
            {product.features.map((feature) => (
              <div className="plan-feature" key={feature}>
                ✓ {featureLabels[feature] ?? feature}
              </div>
            ))}
            <button
              className="button button-primary"
              onClick={() => checkout(product.code)}
              disabled={
                !product.purchasable || !checkoutEnabled || loading !== null
              }
            >
              {loading === product.code
                ? "Проверяем…"
                : product.purchasable && checkoutEnabled
                  ? environment === "sandbox"
                    ? "Тестовая оплата"
                    : "Перейти к оплате"
                  : !checkoutEnabled && product.purchasable
                    ? "Оплата пока недоступна"
                    : "Скоро"}
            </button>
          </article>
        ))}
      </div>
      <div className="payment-safety-note">
        <b>Доступ появится после подтверждения оплаты банком.</b>
        <span>
          Автопродление выключено. Новый срок можно оплатить после окончания
          действующего доступа.
        </span>
      </div>
      {environment === "sandbox" && (
        <p>Тестовый режим: платный доступ не активируется.</p>
      )}
      <p>
        <Link href="/account/billing">История платежей и доступ</Link> ·{" "}
        <Link href="/support#history">Поддержка</Link>
      </p>
      {completedPlan && (
        <button
          className="button button-secondary"
          onClick={newAttempt}
          disabled={loading !== null}
        >
          Начать новую попытку оплаты
        </button>
      )}
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </>
  );
}
