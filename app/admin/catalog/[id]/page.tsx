import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/db";
import { requireRole } from "@/lib/auth/session";
import { CatalogReviewActions } from "@/components/catalog-review-actions";
import type { CatalogChange } from "@/lib/catalog/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Проверка изменений каталога" };
function sourceLinks(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  return [
    ...new Set([
      ...(typeof row.sourceUrl === "string" ? [row.sourceUrl] : []),
      ...Object.values(row).flatMap(sourceLinks),
    ]),
  ];
}

export default async function CatalogRevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireRole(["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"]);
  if (!actor)
    return (
      <div className="page-shell">
        <h1>Доступ ограничен</h1>
        <Link href="/login">Войти</Link>
      </div>
    );
  const { id } = await params;
  const [revision, head] = await Promise.all([
    prisma.catalogRevision.findUnique({ where: { id } }),
    prisma.catalogHead.findUnique({ where: { id: "public" } }),
  ]);
  if (!revision) notFound();
  const { q = "", page = "1" } = await searchParams;
  const changes = revision.changes as unknown as CatalogChange[];
  const filtered = changes.filter((change) =>
    change.path.toLowerCase().includes(q.toLowerCase()),
  );
  const pageNumber = Math.min(
    Math.max(1, Number.parseInt(page) || 1),
    Math.max(1, Math.ceil(filtered.length / 20)),
  );
  const stale = revision.baseRevisionId !== head?.revisionId;
  const labels = {
    REVIEW: "Ожидает проверки",
    PUBLISHED: "Опубликовано",
    REJECTED: "Отклонено",
  };
  return (
    <div className="page-shell catalog-review-page">
      <Link href="/admin/catalog">← Все версии</Link>
      <h1>Проверка изменений</h1>
      <p>{revision.reason}</p>
      <p>
        <strong>{labels[revision.status]}</strong> · {changes.length} изменений
        · требуют внимания: {changes.filter((item) => item.suspicious).length}
      </p>
      <p>
        Создал: {revision.createdBy}. Основа:{" "}
        {revision.baseRevisionId ? (
          <Link href={`/admin/catalog/${revision.baseRevisionId}`}>
            предыдущая версия
          </Link>
        ) : (
          "первоначальная публикация"
        )}
        .
      </p>
      <p>
        Контрольная сумма:{" "}
        <code className="catalog-checksum">{revision.checksum}</code>
      </p>
      <form className="catalog-review-search">
        <label htmlFor="diff-query">Поиск по вузу, программе или полю</label>
        <input id="diff-query" name="q" defaultValue={q} />
        <button className="button button-secondary">Найти изменения</button>
      </form>
      <p role="status">
        Найдено: {filtered.length}. Страница {pageNumber}.
      </p>
      {!filtered.length && (
        <p className="empty-state">По этому запросу изменений нет.</p>
      )}
      {filtered.slice((pageNumber - 1) * 20, pageNumber * 20).map((change) => (
        <article className="catalog-change" key={change.path}>
          <h2>{change.path}</h2>
          {change.suspicious && (
            <p className="catalog-change-warning">
              Требует внимания: удаление или изменение количества в два раза и
              более.
            </p>
          )}
          <div className="catalog-diff-values">
            {[
              ["Было", change.before],
              ["Стало", change.after],
            ].map(([label, value]) => (
              <section key={String(label)}>
                <h3>{String(label)}</h3>
                <pre>
                  {value === null
                    ? "Нет записи"
                    : JSON.stringify(value, null, 2)}
                </pre>
                {sourceLinks(value)
                  .slice(0, 12)
                  .map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  ))}
              </section>
            ))}
          </div>
          {change.path.startsWith("programs.") && (
            <Link
              href={`/programs/${change.path.split(".")[1]}`}
              target="_blank"
            >
              Открыть опубликованную карточку ↗
            </Link>
          )}
        </article>
      ))}
      <nav className="catalog-review-buttons" aria-label="Страницы изменений">
        {pageNumber > 1 && (
          <Link href={`?q=${encodeURIComponent(q)}&page=${pageNumber - 1}`}>
            Предыдущие изменения
          </Link>
        )}
        {pageNumber * 20 < filtered.length && (
          <Link href={`?q=${encodeURIComponent(q)}&page=${pageNumber + 1}`}>
            Следующие изменения
          </Link>
        )}
      </nav>
      {revision.status === "REVIEW" ? (
        <CatalogReviewActions revisionId={id} stale={stale} />
      ) : (
        <p>
          Решение: {revision.reviewNote}. Проверил: {revision.reviewedBy}.{" "}
          {revision.reviewedAt?.toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
          })}
        </p>
      )}
    </div>
  );
}
