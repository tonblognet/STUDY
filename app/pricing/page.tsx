import { PricingClient } from "@/components/pricing-client";

export const metadata = { title: "Тарифы" };

export default function Pricing() {
  return <div className="page-shell pricing-page container"><div className="page-title centered"><span className="overline">Понятные условия</span><h1>Один сезон — одно решение</h1><p>Основной подбор остаётся бесплатным. Платный доступ не скрывает источники и не обещает поступление.</p></div><PricingClient/><p className="pricing-note">Без случайного скрытия данных · без автоматического продления сезонного доступа · итоговые условия проверяются перед включением платежей</p></div>;
}
