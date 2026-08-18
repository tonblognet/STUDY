export const PAYMENT_PLANS = {
  season: {
    code: "season",
    name: "Поступление",
    description: "Доступ к расширенным данным на одну приёмную кампанию",
    amountKopecks: 59_900,
    durationMonths: 4,
  },
} as const;

export type PaymentPlanCode = keyof typeof PAYMENT_PLANS;

export function getPaymentPlan(code: string) {
  return code in PAYMENT_PLANS ? PAYMENT_PLANS[code as PaymentPlanCode] : null;
}
