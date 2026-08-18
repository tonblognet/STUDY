"use client";

import { useState } from "react";
import Link from "next/link";

const free = ["Поиск и подбор по баллам", "Источники, год и статус данных", "До 3 программ в сравнении", "Локальные профили ЕГЭ и избранное"];
const season = ["Полные исторические показатели", "Расширенное сравнение", "Несколько наборов ЕГЭ", "Доступ на одну приёмную кампанию"];
const assistant = ["Всё из тарифа «Поступление»", "Чек-лист и дедлайны", "Ответы со ссылками на правила", "Без непрозрачного процента поступления"];

export function PricingClient() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkout() {
    setLoading(true);
    setMessage("Проверяем готовность защищённой оплаты…");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode: "season" }) });
      const result = await response.json() as { paymentUrl?: string; error?: string };
      if (response.status === 401) {
        window.location.assign("/signin-with-chatgpt?return_to=%2Fpricing");
        return;
      }
      if (!response.ok || !result.paymentUrl) {
        setMessage(result.error ?? "Оплата пока недоступна.");
        return;
      }
      window.location.assign(result.paymentUrl);
    } catch {
      setMessage("Не удалось связаться с платёжным сервисом. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <div className="pricing-grid pricing-grid-three">
      <article>
        <span className="plan-name">Бесплатно</span><h2>0 ₽</h2><p>Достаточно, чтобы собрать первый обоснованный список.</p>
        {free.map((feature) => <div className="plan-feature" key={feature}>✓ {feature}</div>)}
        <Link className="button outline-button" href="/programs">Начать подбор</Link>
      </article>
      <article className="featured-plan">
        <span className="popular-label">На сезон</span><span className="plan-name">Поступление</span><h2>599 ₽</h2><p>Один платёж за 4 месяца. Без автоматического продления.</p>
        {season.map((feature) => <div className="plan-feature" key={feature}>✓ {feature}</div>)}
        <button className="button button-light" onClick={checkout} disabled={loading}>{loading ? "Проверяем…" : "Перейти к оплате"}</button>
      </article>
      <article className="future-plan">
        <span className="plan-name">Помощник</span><h2>1 290 ₽</h2><p>Ценовая гипотеза. Не продаётся до запуска проверенного помощника.</p>
        {assistant.map((feature) => <div className="plan-feature" key={feature}>○ {feature}</div>)}
        <Link className="button outline-button" href="/support?topic=assistant">Сообщить об интересе</Link>
      </article>
    </div>
    <div className="payment-safety-note"><b>Оплата не активирует доступ сама по себе.</b><span>Премиальный статус будет выдаваться только после проверенного уведомления банка и записи платежа в постоянное хранилище.</span></div>
    {message && <div className="toast" role="status" aria-live="polite">{message}</div>}
  </>;
}
