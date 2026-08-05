import { DATA_STATUS_LABELS } from "@/lib/admissions/constants";
import type { DataStatus, SourcedValue } from "@/lib/admissions/types";

export function DataStatusBadge({ status }: { status: DataStatus }) {
  const icon = ({ verified: "✓", not_published: "—", pending_review: "…", outdated: "!", conflicting_sources: "⇄", not_applicable: "×" })[status];
  return <span className={`data-status data-status-${status}`}><span aria-hidden="true">{icon}</span>{DATA_STATUS_LABELS[status]}</span>;
}

export function DataSourceLink<T>({ field, compact = false }: { field: SourcedValue<T>; compact?: boolean }) {
  return <span className="data-source-line">
    <span>{field.year}</span>
    <DataStatusBadge status={field.status}/>
    <a href={field.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Открыть официальный источник: ${field.sourceName}`}>{compact ? "Источник" : field.sourceName} ↗</a>
    {!compact && <time dateTime={field.checkedAt}>проверено {new Intl.DateTimeFormat("ru-RU").format(new Date(field.checkedAt))}</time>}
  </span>;
}

export function SourcedMetric<T>({ label, field, format = String }: { label: string; field: SourcedValue<T>; format?: (value: T) => string }) {
  return <div className={`sourced-metric sourced-metric-${field.status}`}>
    <span className="metric-label">{label}</span>
    <strong>{field.value === null ? "Нет данных" : format(field.value)}</strong>
    <DataSourceLink field={field}/>
    {field.note && <small>{field.note}</small>}
  </div>;
}

export function CompletenessBadge({ percent, missing = [] }: { percent: number; missing?: string[] }) {
  return <div className="completeness" aria-label={`Полнота карточки ${percent} процентов`}>
    <span><b>{percent}%</b> полноты</span>
    <div className="completeness-track" aria-hidden="true"><i style={{ width: `${percent}%` }}/></div>
    {missing.length > 0 && <small>Не хватает: {missing.slice(0, 3).join(", ")}{missing.length > 3 ? "…" : ""}</small>}
  </div>;
}
