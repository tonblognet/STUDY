import Link from "next/link";
import type { ReactNode } from "react";

export function PageState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section
      className="empty-page public-page-state"
      aria-labelledby="page-state-title"
    >
      <span className="overline">Поступай</span>
      <h1 id="page-state-title">{title}</h1>
      <p>{description}</p>
      <div className="journey-actions">
        {children}
        <Link href="/programs" className="button button-secondary">
          Каталог программ
        </Link>
      </div>
    </section>
  );
}

export function PageLoading({
  label = "Загружаем страницу",
}: {
  label?: string;
}) {
  return (
    <div
      className="page-shell container public-loading"
      role="status"
      aria-busy="true"
    >
      <p>{label}…</p>
      <div aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton skeleton-card" key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
