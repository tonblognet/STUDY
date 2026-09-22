import Link from "next/link";
import { prisma } from "@/db";
import { requireRole } from "@/lib/auth/session";
import { catalogStorage } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Публикации каталога" };
const labels = {
  REVIEW: "Ожидает проверки",
  PUBLISHED: "Опубликовано",
  REJECTED: "Отклонено",
};

export default async function CatalogReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const actor = await requireRole(["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"]);
  if (!actor)
    return (
      <div className="page-shell">
        <h1>Доступ ограничен</h1>
        <Link href="/login">Войти</Link>
      </div>
    );
  if (catalogStorage() !== "database")
    return (
      <div className="page-shell">
        <h1>Каталог в режиме снимка</h1>
        <p>
          Для редакторской очереди подключите PostgreSQL и выполните
          первоначальный импорт.
        </p>
      </div>
    );
  const { cursor } = await searchParams;
  const [revisions, head] = await Promise.all([
    prisma.catalogRevision.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        createdBy: true,
      },
    }),
    prisma.catalogHead.findUnique({ where: { id: "public" } }),
  ]);
  return (
    <div className="page-shell catalog-review-page">
      <Link href="/admin">← Администрирование</Link>
      <h1>Публикации каталога</h1>
      <p>
        Импорт создаёт черновик. На сайте видна только подтверждённая версия.
      </p>
      <p>
        Текущая публикация:{" "}
        {head?.revisionId ? (
          <Link href={`/admin/catalog/${head.revisionId}`}>открыть версию</Link>
        ) : (
          "каталог ещё не опубликован"
        )}
        .
      </p>
      {!revisions.length && (
        <p className="empty-state">
          Очередь пуста. Подготовьте снимок и отправьте его командой
          data:import.
        </p>
      )}
      <div className="catalog-review-list">
        {revisions.slice(0, 20).map((revision) => (
          <article key={revision.id}>
            <span>
              {labels[revision.status]}
              {head?.revisionId === revision.id ? " · текущая версия" : ""}
            </span>
            <h2>
              <Link href={`/admin/catalog/${revision.id}`}>
                {revision.reason}
              </Link>
            </h2>
            <time dateTime={revision.createdAt.toISOString()}>
              {revision.createdAt.toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}
            </time>
          </article>
        ))}
      </div>
      {revisions.length > 20 && (
        <Link
          className="button button-secondary"
          href={`/admin/catalog?cursor=${revisions[19].id}`}
        >
          Более ранние версии
        </Link>
      )}
    </div>
  );
}
