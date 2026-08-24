export const DEFAULT_PRODUCTS = [
  {
    code: "default_1",
    name: "Default · 1 месяц",
    description: "Полные данные и расширенное сравнение",
    amountKopecks: 19_900,
    durationMonths: 1,
    features: ["admission_full_data", "ai_level_1_discount"],
  },
  {
    code: "default_3",
    name: "Default · 3 месяца",
    description: "Полные данные на основной период выбора",
    amountKopecks: 34_900,
    durationMonths: 3,
    features: ["admission_full_data", "ai_level_1_discount"],
  },
  {
    code: "default_12",
    name: "Default · 12 месяцев",
    description: "Полный год сопровождения",
    amountKopecks: 59_900,
    durationMonths: 12,
    features: [
      "admission_full_data",
      "ai_level_1_discount",
      "advanced_tracking",
    ],
  },
  {
    code: "ai_level_1_request",
    name: "AI Level 1 · 1 запрос",
    description: "Разовая рекомендация; для Default цена 39 ₽",
    amountKopecks: 7_900,
    durationMonths: 0,
    features: ["ai_level_1_request"],
  },
  {
    code: "ai_level_2_3",
    name: "AI Level 2 · 3 месяца",
    description: "Персональный помощник по поступлению",
    amountKopecks: 129_900,
    durationMonths: 3,
    features: ["ai_level_2", "advanced_tracking", "premium_notifications"],
  },
  {
    code: "ai_level_2_3_bundle",
    name: "AI Level 2 + Level 3 · 3 месяца",
    description: "Помощник и будущие официальные интеграции",
    amountKopecks: 189_900,
    durationMonths: 3,
    features: [
      "ai_level_2",
      "ai_level_3",
      "advanced_tracking",
      "premium_notifications",
    ],
  },
] as const;

export function getPaymentPlan(code: string) {
  return DEFAULT_PRODUCTS.find((product) => product.code === code) ?? null;
}
