"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PublicProduct = {
  code: string;
  name: string;
  description: string;
  amountKopecks: number;
  durationMonths: number;
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

export function PricingClient({ products }: { products: PublicProduct[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function checkout(planCode: string) {
    setLoading(planCode);
    setMessage("Проверяем готовность защищённой оплаты…");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ planCode }),
      });
      const result = (await response.json()) as {
        paymentUrl?: string;
        error?: string;
      };
      if (response.status === 401) {
        router.push("/login?returnTo=/pricing");
        return;
      }
      if (!response.ok || !result.paymentUrl) {
        setMessage(result.error ?? "Оплата пока недоступна.");
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
            {product.features.map((feature) => (
              <div className="plan-feature" key={feature}>
                ✓ {featureLabels[feature] ?? feature}
              </div>
            ))}
            <button
              className="button button-primary"
              onClick={() => checkout(product.code)}
              disabled={!product.purchasable || loading !== null}
            >
              {loading === product.code
                ? "Проверяем…"
                : product.purchasable
                  ? "Перейти к оплате"
                  : "Скоро"}
            </button>
          </article>
        ))}
      </div>
      <div className="payment-safety-note">
        <b>Доступ активирует только подтверждённый webhook банка.</b>
        <span>
          Секреты не попадают во frontend. Автопродление выключено по умолчанию.
        </span>
      </div>
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </>
  );
}
