export const formatPrice = (value: number | null) =>
  value === null
    ? "не опубликовано"
    : `${new Intl.NumberFormat("ru-RU").format(value)} ₽/год`;
