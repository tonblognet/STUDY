import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UniversityLogo } from "@/components/university-logo";
import { DATA_STATUS_LABELS } from "@/lib/admissions/constants";
import { formatPrice, getUniversity, programs, universities } from "@/lib/data";

export function generateStaticParams() {
  return universities.map((university) => ({ slug: university.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const university = getUniversity(slug);
  return {
    title: university?.shortName ?? "Вуз",
    description: university?.description,
  };
}

export default async function UniversityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const university = getUniversity(slug);
  if (!university) notFound();
  const related = programs.filter((program) => program.universitySlug === slug);
  const verified = related.filter(
    (program) => program.trust.status === "verified",
  ).length;
  const budgetKnown = related.filter(
    (program) => (program.budgetPlaces ?? 0) > 0,
  ).length;

  return (
    <main className="university-profile">
      <div className="university-profile-shell">
        <div className="breadcrumbs">
          <Link href="/universities">Вузы Москвы</Link>
          <span>/</span>
          <span>{university.shortName}</span>
        </div>

        <section className="university-profile-hero">
          <div className="university-profile-mark">
            <UniversityLogo university={university} size="hero" />
            <a href={university.logoSourceUrl} target="_blank" rel="noreferrer">
              Официальная символика ↗
            </a>
          </div>
          <div className="university-profile-copy">
            <span className="overline">
              {university.city} · государственный вуз
            </span>
            <h1>{university.name}</h1>
            <p>{university.description}</p>
            <div className="hero-actions">
              <a
                className="button button-primary"
                href={university.admissionsUrl ?? university.website}
                target="_blank"
                rel="noreferrer"
              >
                Приёмная комиссия ↗
              </a>
              <Link
                className="button button-secondary"
                href={`/programs?q=${encodeURIComponent(university.shortName)}`}
              >
                Найти программу
              </Link>
            </div>
          </div>
          <aside className="university-facts-rail" aria-label="Ключевые факты">
            <div>
              <span>Программ в каталоге</span>
              <strong>{related.length}</strong>
            </div>
            <div>
              <span>Полностью проверено</span>
              <strong>{verified}</strong>
            </div>
            <div>
              <span>С известным бюджетом</span>
              <strong>{budgetKnown}</strong>
            </div>
            <div>
              <span>Год основания</span>
              <strong>{university.foundedYear ?? "—"}</strong>
            </div>
          </aside>
        </section>

        <nav className="university-profile-nav" aria-label="Разделы страницы">
          <a href="#overview">О вузе</a>
          <a href="#programs">Программы</a>
          <a href="#campus">Кампус и общежития</a>
          <a href="#military">Военный учебный центр</a>
          <a href="#contacts">Контакты</a>
        </nav>

        <section id="overview" className="university-overview-grid">
          <div>
            <span className="overline">Образовательная среда</span>
            <h2>Главное для выбора</h2>
            <p className="editorial-lead">
              Мы отделяем сведения о самом вузе от параметров конкретной
              конкурсной группы. Проверяйте год, форму обучения и статус каждого
              значения в карточке программы.
            </p>
          </div>
          <div className="university-direction-list">
            <strong>Основные области</strong>
            <div>
              {(
                university.faculties ??
                [...new Set(related.flatMap((program) => program.tags))].slice(
                  0,
                  6,
                )
              ).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <aside className="university-source-card">
            <span>Источник профиля</span>
            <strong>Официальный сайт вуза</strong>
            <p>
              Факты не переносятся автоматически в условия отдельной программы.
            </p>
            <a
              href={university.factsSourceUrl ?? university.website}
              target="_blank"
              rel="noreferrer"
            >
              Открыть источник ↗
            </a>
          </aside>
        </section>

        <section id="programs" className="university-program-section">
          <div className="university-section-head">
            <div>
              <span className="overline">
                {String(related.length).padStart(2, "0")} программ
              </span>
              <h2>Программы вуза</h2>
            </div>
            <Link href={`/match`} className="button button-primary">
              Проверить свои баллы
            </Link>
          </div>
          <div className="university-program-table">
            <div className="university-program-row university-program-head">
              <span>Программа</span>
              <span>Уровень</span>
              <span>Бюджет</span>
              <span>Стоимость</span>
              <span>Статус</span>
              <span />
            </div>
            {related.map((program) => (
              <div className="university-program-row" key={program.id}>
                <div>
                  <b>{program.title}</b>
                  <small>
                    {program.code} · {program.form}
                  </small>
                </div>
                <span>{program.level}</span>
                <span>{program.budgetPlaces ?? "—"}</span>
                <span>{formatPrice(program.tuition)}</span>
                <span className={`data-status ${program.trust.status}`}>
                  {DATA_STATUS_LABELS[program.trust.status]}
                </span>
                <Link
                  href={`/programs/${program.slug}`}
                  aria-label={`Открыть ${program.title}`}
                >
                  →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="university-practical-grid">
          <article id="campus">
            <span className="overline">Кампус</span>
            <h2>Общежития</h2>
            <strong>
              {university.dormitoriesCount
                ? `${university.dormitoriesCount} корпусов`
                : "Условия уточняются"}
            </strong>
            <p>
              Наличие общежития у вуза не означает автоматического
              предоставления места. Условия зависят от программы, категории и
              конкурса.
            </p>
            <a
              href={university.factsSourceUrl ?? university.website}
              target="_blank"
              rel="noreferrer"
            >
              Проверить у вуза ↗
            </a>
          </article>
          <article id="military">
            <span className="overline">Подготовка</span>
            <h2>Военный учебный центр</h2>
            <strong>
              {university.militaryCenter === true
                ? "Наличие подтверждено"
                : university.militaryCenter === false
                  ? "Нет"
                  : "Нет подтверждённых данных"}
            </strong>
            <p>
              Приём в ВУЦ проходит отдельно и зависит от формы обучения,
              здоровья и конкурсного отбора.
            </p>
            {university.militaryCenterSourceUrl ? (
              <a
                href={university.militaryCenterSourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Официальная страница ВУЦ ↗
              </a>
            ) : (
              <span className="university-muted">
                Источник ожидает проверки
              </span>
            )}
          </article>
          <article id="contacts">
            <span className="overline">Связь</span>
            <h2>Приёмная комиссия</h2>
            <address>{university.address}</address>
            {university.admissionsPhone && (
              <a
                href={`tel:${university.admissionsPhone.replace(/[^+\d]/g, "")}`}
              >
                {university.admissionsPhone}
              </a>
            )}
            {university.admissionsEmail && (
              <a href={`mailto:${university.admissionsEmail}`}>
                {university.admissionsEmail}
              </a>
            )}
            <a
              href={university.admissionsUrl ?? university.website}
              target="_blank"
              rel="noreferrer"
            >
              Официальный раздел поступления ↗
            </a>
          </article>
        </section>
      </div>
    </main>
  );
}
