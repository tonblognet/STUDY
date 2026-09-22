import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UniversityLogo } from "@/components/university-logo";
import { DATA_STATUS_LABELS } from "@/lib/admissions/constants";
import { getCatalog } from "@/lib/catalog/server";
import { formatPrice } from "@/lib/catalog/format";
import {
  MguMap,
  MguPrograms,
  MguScoreArchive,
} from "@/components/mgu-explorer";
import {
  getMguProgramTitle,
  mguCatalogPrograms,
  mguPassingScoreRecords,
} from "@/lib/mgu-data";
import { mguDormitoryConditions } from "@/lib/mgu-details";
import { DataSourceLink } from "@/components/data-status";
import { universityTypeLabel } from "@/lib/moscow-universities";
import { UniversityVerifiedDetails } from "@/components/university-verified-details";
import { UniversityOfferings } from "@/components/university-offerings";
import { UniversityAdmissionCampaign } from "@/components/university-admission-campaign";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getCatalog();
  const university = catalog.universities.find((item) => item.slug === slug);
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
  const catalog = await getCatalog();
  const university = catalog.universities.find((item) => item.slug === slug);
  if (!university) notFound();
  const related = catalog.programs.filter(
    (program) => program.universitySlug === slug,
  );
  const directoryDetails = catalog.directoryDetails.find(
    (item) => item.universitySlug === slug,
  );
  const campaign = catalog.admissionCampaigns.find(
    (item) => item.universitySlug === slug,
  );
  const offerings = directoryDetails?.offerings ?? [];
  const admissionsUrl =
    university.admissionsUrl ?? directoryDetails?.fields.admissionsUrl?.value;
  const isMgu = slug === "mgu";
  const factProfile = catalog.universityFacts.find(
    (item) => item.universitySlug === slug,
  )!;
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
            {university.logoUrl ? (
              <a
                href={university.logoSourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Источник символики ↗
              </a>
            ) : (
              <span className="university-muted">Логотип пока не получен</span>
            )}
          </div>
          <div className="university-profile-copy">
            <span className="overline">
              {university.city} · {universityTypeLabel(university)}
            </span>
            <h1>{university.name}</h1>
            <p>{university.description}</p>
            <div className="hero-actions">
              <a
                className="button button-primary"
                href={admissionsUrl ?? university.website}
                target="_blank"
                rel="noreferrer"
              >
                {admissionsUrl ? "Приёмная комиссия ↗" : "Официальный сайт ↗"}
              </a>
              {related.length > 0 && (
                <Link
                  className="button button-secondary"
                  href={`/programs?q=${encodeURIComponent(university.shortName)}`}
                >
                  Найти программу
                </Link>
              )}
            </div>
          </div>
          <aside className="university-facts-rail" aria-label="Ключевые факты">
            {related.length === 0 ? (
              <>
                <div>
                  <span>Тип организации</span>
                  <strong>
                    {university.directory?.kind === "branch" ? "Филиал" : "Вуз"}
                  </strong>
                </div>
                <div>
                  <span>Форма собственности</span>
                  <strong>
                    {university.directory?.ownership === "private"
                      ? "Частная"
                      : "Государственная"}
                  </strong>
                </div>
                <div>
                  <span>Программы</span>
                  <strong>
                    {campaign
                      ? `${campaign.groups.length} групп приёма ${campaign.year}`
                      : offerings.length > 0
                        ? `${offerings.length} в перечне вуза`
                        : "Ещё не добавлены"}
                  </strong>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </aside>
        </section>

        <nav className="university-profile-nav" aria-label="Разделы страницы">
          <a href="#overview">О вузе</a>
          <a href="#programs">Программы</a>
          {isMgu && <a href="#history">Баллы по годам</a>}
          {isMgu && <a href="#map">Карта</a>}
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
          {university.faculties?.length || related.length > 0 ? (
            <div className="university-direction-list">
              <strong>Основные области</strong>
              <div>
                {(
                  university.faculties ??
                  [
                    ...new Set(related.flatMap((program) => program.tags)),
                  ].slice(0, 6)
                ).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="university-direction-list">
              <strong>Сведения об организации</strong>
              <p>{university.directory?.authority}</p>
              <p>
                {campaign
                  ? `Условия приёма ${campaign.year} приведены ниже.`
                  : offerings.length > 0
                    ? "Перечень направлений и профилей приведён ниже."
                    : "Образовательные программы будут добавлены отдельно."}
              </p>
            </div>
          )}
          <aside className="university-source-card">
            <span>Источник профиля</span>
            <strong>
              {university.directory
                ? "Официальные сведения"
                : "Официальный сайт вуза"}
            </strong>
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

        {university.directory && (
          <section className="university-directory-provenance">
            <h2>Официальные сведения</h2>
            <p>{university.directory.legalName}</p>
            <p>{university.directory.note}</p>
            <a
              href={university.directory.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Источник сведений об организации ↗
            </a>
            <span>
              Проверено{" "}
              {new Date(university.directory.checkedAt).toLocaleDateString(
                "ru-RU",
              )}
              . Период источника: {university.directory.sourceYear}.
            </span>
          </section>
        )}

        {directoryDetails && (
          <UniversityVerifiedDetails details={directoryDetails} />
        )}

        {isMgu ? (
          <>
            <MguPrograms
              rows={related.map((program) => {
                const seed = mguCatalogPrograms.find(
                  (item) =>
                    item.faculty === program.faculty &&
                    item.code === program.code &&
                    getMguProgramTitle(item.description) === program.title,
                );
                const verified = (fact: typeof program.budgetPlacesValue) =>
                  fact.status === "verified" ? fact.value : null;
                return {
                  slug: program.slug,
                  title: program.title,
                  faculty: program.faculty ?? "Факультет уточняется",
                  code: program.code,
                  level: program.level,
                  description: seed?.description ?? program.title,
                  budget: program.budgetPlaces,
                  paid: program.paidPlaces,
                  budgetSource: program.budgetPlacesValue,
                  paidSource: program.paidPlacesValue,
                  exams: seed?.examGroups ?? [
                    ...program.subjects,
                    ...(program.dvi ? [program.dvi] : []),
                  ],
                  page: program.trust.sourcePage ?? seed?.page ?? 1,
                  special: verified(program.quotas.special),
                  separate: verified(program.quotas.separate),
                  target: seed?.targetQuota ?? verified(program.quotas.target),
                  requirements: program.examRequirements,
                  dviMinimum: program.dviMinimum,
                  tuition: program.tuitionValue,
                  duration: program.durationValue,
                  contact: program.admissionsContact,
                  sourceUrl: program.sourceUrl,
                };
              })}
            />
            <MguScoreArchive records={mguPassingScoreRecords} />
            <MguMap />
          </>
        ) : related.length === 0 && campaign ? (
          <div id="programs">
            <UniversityAdmissionCampaign campaign={campaign} />
            {offerings.length > 0 && <UniversityOfferings rows={offerings} />}
          </div>
        ) : related.length === 0 && offerings.length > 0 ? (
          <div id="programs">
            <UniversityOfferings rows={offerings} />
          </div>
        ) : related.length === 0 ? (
          <section id="programs" className="university-directory-empty">
            <h2>Программы ещё не добавлены</h2>
            <p>
              Карточка вуза уже доступна. Направления, места и условия
              поступления добавим после отдельной проверки.
            </p>
            <a
              className="button button-secondary"
              href={admissionsUrl ?? university.website}
              target="_blank"
              rel="noreferrer"
            >
              Посмотреть информацию у вуза ↗
            </a>
          </section>
        ) : (
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
        )}

        {!isMgu && related.length > 0 && offerings.length > 0 && (
          <UniversityOfferings rows={offerings} />
        )}
        {!isMgu && related.length > 0 && campaign && (
          <UniversityAdmissionCampaign campaign={campaign} />
        )}

        <section className="university-practical-grid">
          <article id="campus">
            <span className="overline">Кампус</span>
            <h2>Общежития</h2>
            <strong>
              {isMgu
                ? "Дом студента МГУ"
                : directoryDetails?.fields.hostelInfo
                  ? directoryDetails.fields.hostelInfo.value
                  : university.dormitoriesCount
                    ? `${university.dormitoriesCount} корпусов`
                    : "Условия уточняются"}
            </strong>
            <p>
              {isMgu ? (
                mguDormitoryConditions.value
              ) : (
                <>
                  Наличие общежития у вуза не означает автоматического
                  предоставления места. Условия зависят от программы, категории
                  и конкурса.
                </>
              )}
            </p>
            {isMgu && <DataSourceLink field={mguDormitoryConditions} />}
            <a
              href={
                isMgu
                  ? "https://osk.msu.ru/d/1/faq/"
                  : (directoryDetails?.fields.hostelInfo?.sourceUrl ??
                    university.factsSourceUrl ??
                    university.website)
              }
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
            <h2>{admissionsUrl ? "Приёмная комиссия" : "Адрес и сайт"}</h2>
            <address>
              {factProfile.facts.address.value ??
                "Точный адрес пока не подтверждён"}
            </address>
            {!isMgu && (
              <>
                <DataSourceLink field={factProfile.facts.address} />
                <p>
                  {factProfile.facts.address.value
                    ? "Адрес организации из указанного источника. Перед поездкой уточните корпус и место приёма на сайте вуза."
                    : `Город: ${university.city}. Уточните адрес на официальном сайте.`}
                </p>
              </>
            )}
            {isMgu && (
              <>
                <DataSourceLink field={factProfile.facts.address} />
                <p>
                  Общий адрес университета. Контакты Центральной приёмной
                  комиссии:
                </p>
              </>
            )}
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
              href={
                isMgu
                  ? "https://cpk.msu.ru/pk"
                  : (admissionsUrl ?? university.website)
              }
              target="_blank"
              rel="noreferrer"
            >
              {admissionsUrl
                ? "Официальный раздел поступления ↗"
                : "Официальный сайт ↗"}
            </a>
          </article>
        </section>
        {isMgu && (
          <section className="mgu-section">
            <span className="overline">Документы и полезные ссылки</span>
            <h2>Подготовиться к поступлению</h2>
            <div className="mgu-resources">
              <a href="https://cpk.msu.ru/" target="_blank" rel="noreferrer">
                <strong>Кампания 2026 ↗</strong>
                <span>
                  Сроки, способы подачи документов и текущие объявления ЦПК
                </span>
              </a>
              <a
                href="https://cpk.msu.ru/files/2026/minimum.pdf"
                target="_blank"
                rel="noreferrer"
              >
                <strong>Минимальные баллы ↗</strong>
                <span>
                  Порог участия в конкурсе, особые требования факультетов и ДВИ
                </span>
              </a>
              <a
                href="https://cpk.msu.ru/legal"
                target="_blank"
                rel="noreferrer"
              >
                <strong>Официальные документы ↗</strong>
                <span>
                  Правила приёма, документы об образовании, архивы и стоимость
                </span>
              </a>
              <a
                href="https://cpk.msu.ru/entrance/2025"
                target="_blank"
                rel="noreferrer"
              >
                <strong>Задания ДВИ ↗</strong>
                <span>
                  Официальные варианты испытаний 2025 года для подготовки
                </span>
              </a>
            </div>
            <p className="mgu-note">
              План приёма и архив получены 27 августа 2026 года. Минимумы,
              стоимость, сроки обучения и контакты повторно проверены 14
              сентября. Подтверждённые значения и оставшиеся пробелы указаны в
              каждой карточке с источником. Данные до 2011 года в этот архив не
              внесены.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
