import Link from "next/link";
import { DATA_STATUS_LABELS } from "@/lib/admissions/constants";
import { requireRole } from "@/lib/auth/session";
import { programs, universities } from "@/lib/data";

export const metadata = { title: "Администрирование" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
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
  const verified = programs.filter(
    (program) => program.trust.status === "verified",
  ).length;
  const needsReview = programs.length - verified;
  const reviewQueue = programs
    .filter((program) => program.trust.status !== "verified")
    .sort((left, right) => left.trust.completeness - right.trust.completeness);
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
        <a href="#imports">Импорты</a>
        <a href="#users">Пользователи</a>
        <a href="#billing">Тарифы</a>
        <a href="#support">Поддержка</a>
        <a href="#audit">Audit log</a>
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
          <span>Критические импорты</span>
          <strong>0</strong>
          <small>по текущему отчёту</small>
        </article>
      </div>
      <section id="content" className="admin-panel">
        <div className="admin-row admin-row-head">
          <span>Программа</span>
          <span>Статус</span>
          <span>Полнота</span>
          <span>Источник</span>
        </div>
        {reviewQueue.slice(0, 40).map((program) => (
          <div className="admin-row" key={program.id}>
            <div>
              <b>{program.title}</b>
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
          Показаны первые {Math.min(40, reviewQueue.length)} из{" "}
          {reviewQueue.length} карточек очереди.
        </strong>
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
          Конкурентный запуск одного источника блокируется idempotency key.
        </p>
        <Link href="/methodology" className="text-link">
          Политика публикации →
        </Link>
      </section>
    </div>
  );
}
