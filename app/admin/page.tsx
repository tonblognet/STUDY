import Link from "next/link";
import { DATA_STATUS_LABELS } from "@/lib/admissions/constants";
import { requireRole } from "@/lib/auth/session";
import { getCatalog, catalogStorage } from "@/lib/catalog/server";
import { prisma } from "@/db";

export const metadata = { title: "Администрирование" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireRole(["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"]);
  if (!user)
    return (
      <div className="page-shell">
        <div className="empty-state">
          <strong>Доступ ограничен</strong>
          <p>Редакторские команды проверяются на сервере.</p>
          <Link href="/" className="button button-primary">
            На главную
          </Link>
        </div>
      </div>
    );
  if (
    catalogStorage() === "database" &&
    !(await prisma.catalogHead.findUnique({ where: { id: "public" } }))
      ?.revisionId
  )
    return (
      <div className="page-shell">
        <h1>Каталог ещё не опубликован</h1>
        <Link className="button button-primary" href="/admin/catalog">
          Открыть очередь публикаций
        </Link>
      </div>
    );
  const { programs, universities } = await getCatalog();
  const verified = programs.filter(
    (program) => program.trust.status === "verified",
  ).length;
  const needsReview = programs.length - verified;
  const { q = "", page = "1" } = await searchParams;
  const query = q.trim().toLocaleLowerCase("ru");
  const reviewQueue = programs
    .filter(
      (program) =>
        !query ||
        `${program.title} ${program.universityShort} ${program.code} ${program.slug}`
          .toLocaleLowerCase("ru")
          .includes(query),
    )
    .sort((left, right) => left.trust.completeness - right.trust.completeness);
  const pages = Math.max(1, Math.ceil(reviewQueue.length / 40));
  const currentPage = Math.min(
    pages,
    Math.max(1, Number.parseInt(page, 10) || 1),
  );
  const pageHref = (number: number) =>
    `/admin?${new URLSearchParams({ q, page: String(number) })}`;
  const conflicts = programs.filter((program) =>
    Object.values(program).some(
      (value) =>
        value &&
        typeof value === "object" &&
        "status" in value &&
        value.status === "conflicting_sources",
    ),
  ).length;
  return (
    <div className="admin-page">
      <div className="dashboard-head">
        <div>
          <span className="overline">Administration</span>
          <h1>Контроль данных</h1>
          <p>
            {user.email} · роль {user.role}
          </p>
        </div>
        <Link href="/api/health" className="button button-secondary">
          Проверить систему
        </Link>
      </div>
      <nav className="account-nav" aria-label="Разделы администрирования">
        <a href="#content">Контент</a>
        <Link href="/admin/catalog">Импорты и публикации</Link>
      </nav>
      <div className="admin-stats">
        <article>
          <span>Вузов</span>
          <strong>{universities.length}</strong>
          <small>в текущем снимке</small>
        </article>
        <article>
          <span>Программ</span>
          <strong>{programs.length}</strong>
          <small>{verified} проверено</small>
        </article>
        <article>
          <span>Требуют review</span>
          <strong>{needsReview}</strong>
          <small>не публикуются как полные</small>
        </article>
        <article>
          <span>Конфликты источников</span>
          <strong>{conflicts}</strong>
          <small>программ с противоречивыми данными</small>
        </article>
      </div>
      <section id="content" className="admin-panel">
        <form action="/admin" className="catalog-review-form">
          <label htmlFor="admin-query">Найти программу или вуз</label>
          <input id="admin-query" name="q" type="search" defaultValue={q} />
          <button className="button button-secondary" type="submit">
            Найти
          </button>
        </form>
        <div className="admin-row admin-row-head">
          <span>Программа</span>
          <span>Статус</span>
          <span>Полнота</span>
          <span>Источник</span>
        </div>
        {reviewQueue
          .slice((currentPage - 1) * 40, currentPage * 40)
          .map((program) => (
            <div className="admin-row" key={program.id}>
              <div>
                <Link href={`/admin/programs/${program.slug}`}>
                  {program.title}
                </Link>
                <small>
                  {program.universityShort} · {program.code}
                </small>
              </div>
              <span>{DATA_STATUS_LABELS[program.trust.status]}</span>
              <span>{program.trust.completeness}%</span>
              <a href={program.sourceUrl} target="_blank" rel="noreferrer">
                Открыть ↗
              </a>
            </div>
          ))}
      </section>
      <div className="admin-queue-note">
        <strong>
          Найдено {reviewQueue.length} программ. Страница {currentPage} из{" "}
          {pages}.
        </strong>
        {currentPage > 1 && (
          <Link
            className="button button-secondary"
            href={pageHref(currentPage - 1)}
          >
            Назад
          </Link>
        )}
        {currentPage < pages && (
          <Link
            className="button button-secondary"
            href={pageHref(currentPage + 1)}
          >
            Далее
          </Link>
        )}
        <p>
          Сначала идут записи с самой низкой полнотой. Публикация названия не
          превращает неизвестные места, экзамены или стоимость в проверенные
          значения.
        </p>
      </div>
      <section id="imports" className="admin-section">
        <h2>Импорты и качество</h2>
        <p>
          Pipeline публикует только прошедшие validation и review изменения.
          Публикация выполняется атомарно; устаревшие черновики требуют
          повторного импорта.
        </p>
        <Link href="/methodology" className="text-link">
          Политика публикации →
        </Link>
      </section>
    </div>
  );
}
