import type { HistoricalPoint } from "@/lib/admissions/types";
import { DataStatusBadge } from "@/components/data-status";

export function HistoryChart({
  title,
  points,
  unit = "",
  warning = true,
  comparable = true,
}: {
  title: string;
  points: HistoricalPoint[];
  unit?: string;
  warning?: boolean;
  comparable?: boolean;
}) {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  const values = sorted
    .filter((point) => point.value !== null)
    .map((point) => point.value!);
  const max = Math.max(...values, 1);
  const known = sorted.filter((point) => point.value !== null);
  const first = known[0]?.value ?? null;
  const last = known.at(-1)?.value ?? null;
  const delta =
    first !== null && last !== null && known.length > 1 ? last - first : null;
  const description =
    known.length < 2
      ? "Недостаточно опубликованных лет для вывода о тренде."
      : delta === 0
        ? "Опубликованные значения не изменились."
        : `За доступный период значение ${delta! > 0 ? "выросло" : "снизилось"} на ${Math.abs(delta!)}${unit}.`;

  return (
    <figure className="history-chart">
      <figcaption>
        <div>
          <span>История показателя</span>
          <h3>{title}</h3>
        </div>
        <p>
          {comparable
            ? description
            : "Шкалы и состав испытаний менялись: прямое сравнение и тренд не рассчитываются."}
        </p>
      </figcaption>
      {sorted.length === 0 ? (
        <div className="chart-empty">
          <b>История не опубликована</b>
          <span>Мы не соединяем отсутствующие годы предполагаемой линией.</span>
        </div>
      ) : !comparable ? (
        <div className="mgu-point-history">
          {sorted.map((point) => (
            <div key={`${point.year}-${point.sourceUrl}`}>
              <b>
                {point.year} · {point.value ?? "Нет данных"}
                {unit}
              </b>
              <DataStatusBadge status={point.status} />
              <p>{point.note}</p>
              <a href={point.sourceUrl} target="_blank" rel="noreferrer">
                Официальный источник ↗
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="chart-bars"
          role="img"
          aria-label={`${title}. ${sorted.map((point) => `${point.year}: ${point.value ?? "нет данных"}`).join("; ")}`}
        >
          {sorted.map((point) => (
            <div
              className="chart-column"
              key={`${point.year}-${point.sourceUrl}`}
            >
              <span className="chart-value">
                {point.value === null
                  ? "Нет данных"
                  : `${new Intl.NumberFormat("ru-RU").format(point.value)}${unit}`}
              </span>
              <div
                className={
                  point.value === null ? "chart-bar missing" : "chart-bar"
                }
                style={{
                  height:
                    point.value === null
                      ? 8
                      : `${Math.max(14, Math.round((point.value / max) * 100))}%`,
                }}
                aria-hidden="true"
              />
              <b>{point.year}</b>
              <DataStatusBadge status={point.status} />
            </div>
          ))}
        </div>
      )}
      {warning && (
        <p className="chart-warning">
          Исторические показатели помогают оценить контекст, но не гарантируют
          результат будущей приёмной кампании.
        </p>
      )}
    </figure>
  );
}
