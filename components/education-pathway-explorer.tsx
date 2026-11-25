"use client";

import Link from "next/link";
import {
  hseHasKnownConditions,
  type HseDisplayFact,
} from "@/lib/hse-explorer-data";
import {
  PATHWAY_PAGE,
  PATHWAY_STEP,
  pathwaySearch,
  type PathwayView,
} from "@/lib/catalog/pathway-view";
import styles from "./hse-program-explorer.module.css";

function Fact({
  label,
  field,
  price = false,
}: {
  label: string;
  field?: HseDisplayFact<number>;
  price?: boolean;
}) {
  const known = field?.status === "verified" && field.value !== null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {known ? (
          <>
            <a href={field.sourceUrl} target="_blank" rel="noreferrer">
              {new Intl.NumberFormat("ru-RU").format(field.value!)}
              {price ? " ₽" : ""}
            </a>
            <small>{field.year} · источник</small>
          </>
        ) : (
          <span className={styles.unknown}>
            {field?.status === "not_applicable"
              ? "Не применяется"
              : "Нет подтверждённых данных"}
          </span>
        )}
      </dd>
    </div>
  );
}

export function EducationPathwayExplorer({
  track,
  view,
}: {
  track: string;
  view: PathwayView;
}) {
  // Filtering runs on the server (ADR 0006); a changed select submits the form.
  const { query, options } = view;
  const submit = (event: { currentTarget: { form: HTMLFormElement | null } }) =>
    event.currentTarget.form?.requestSubmit();
  const hasFilters = Boolean(
    query.query ||
      query.university ||
      query.campus ||
      query.faculty ||
      query.form ||
      query.funding ||
      query.maxTuition ||
      query.year ||
      query.conditions ||
      query.schoolBase,
  );
  return (
    <section
      className={styles.explorer}
      aria-labelledby="pathway-catalog-title"
    >
      <div className={styles.heading}>
        <div>
          <h2 id="pathway-catalog-title">Программы и условия поступления</h2>
          <p>
            Выберите вуз, подразделение и форму обучения. У каждой записи есть
            ссылка на источник.
          </p>
        </div>
      </div>
      <form className={styles.controls} method="get" action="/programs">
        <input type="hidden" name="track" value={track} />
        <label>
          Название или код программы
          <input
            type="search"
            name="q"
            defaultValue={query.query ?? ""}
            placeholder="Например, экономика"
          />
        </label>
        <label>
          Учебное заведение
          <select
            aria-label="Учебное заведение"
            name="university"
            defaultValue={query.university}
            onChange={submit}
          >
            <option value="">Все учебные заведения</option>
            {options.universities.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Город или кампус
          <select
            aria-label="Город или кампус"
            name="campus"
            defaultValue={query.campus ?? ""}
            onChange={submit}
          >
            <option value="">Все города и кампусы</option>
            {options.campuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Подразделение
          <select
            aria-label="Подразделение"
            name="faculty"
            defaultValue={query.faculty ?? ""}
            onChange={submit}
          >
            <option value="">Все подразделения, включая неуказанные</option>
            {options.faculties.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Форма обучения
          <select
            aria-label="Форма обучения"
            name="form"
            defaultValue={query.form ?? ""}
            onChange={submit}
          >
            <option value="">Любая форма</option>
            {options.forms.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Финансирование
          <select
            aria-label="Финансирование"
            name="funding"
            defaultValue={query.funding ?? ""}
            onChange={submit}
          >
            <option value="">Любое финансирование</option>
            <option value="budget">Есть бюджетные места</option>
            <option value="paid">Есть платные места</option>
          </select>
        </label>
        <label>
          Стоимость года до, ₽
          <input
            type="number"
            name="maxTuition"
            min="0"
            step="10000"
            defaultValue={query.maxTuition ?? ""}
            placeholder="Без ограничения"
          />
        </label>
        <label>
          Год набора
          <select
            aria-label="Год набора"
            name="year"
            defaultValue={query.year ?? ""}
            onChange={submit}
          >
            <option value="">Все годы, включая неуказанные</option>
            {options.years.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Наличие условий
          <select
            aria-label="Наличие условий"
            name="conditions"
            defaultValue={query.conditions ?? ""}
            onChange={submit}
          >
            <option value="">Все записи</option>
            <option value="known">Есть подтверждённые условия</option>
            <option value="needs-review">Условия нужно сверить</option>
          </select>
        </label>
        {options.schoolBase && (
          <label>
            Образование до колледжа
            <select
              aria-label="Образование до колледжа"
              name="school"
              defaultValue={query.schoolBase}
              onChange={submit}
            >
              <option value="">Любое, включая неуказанное</option>
              <option value="9">После 9 классов</option>
              <option value="11">После 11 классов</option>
            </select>
          </label>
        )}
        <button className="button button-secondary" type="submit">
          Найти
        </button>
      </form>
      <p className={styles.filterNote}>
        Фильтры цены, финансирования и года учитывают подтверждённые условия
        конкретной программы. Год публикации перечня не считается годом набора.
        Записи без этих данных видны без ограничений.
      </p>
      <div className={styles.results}>
        <p role="status">
          Найдено записей: {view.matched} из {view.total}
        </p>
        {hasFilters && (
          <Link href={`/programs?track=${track}`}>Сбросить фильтры</Link>
        )}
      </div>
      <div className={styles.cards}>
        {view.rows.map((row) => {
          const institution = row;
          const master = row.masterTuition;
          const admission = row.admission;
          const exams = master?.exams ?? admission?.exams;
          return (
            <article key={row.id} className={styles.card}>
              <div className={styles.identity}>
                <p className={styles.classification}>
                  {institution.universityName} · {row.campus}
                </p>
                <h3>{row.title}</h3>
                <p>
                  {row.code} · {row.level}
                </p>
                {row.faculty && <p>{row.faculty}</p>}
                {row.offering?.profile &&
                  row.offering.profile !== row.title && (
                    <p>{row.offering.profile}</p>
                  )}
                <p>
                  {row.form}
                  {row.duration && ` · ${row.duration}`}
                </p>
                <p className={styles.conditionStatus}>
                  {hseHasKnownConditions(row)
                    ? "Есть подтверждённые условия"
                    : "Набор и условия приёма нужно сверить"}
                </p>
              </div>
              {admission?.priorEducation?.status === "verified" &&
                admission.priorEducation.value && (
                  <p className={styles.note}>
                    Предыдущее образование:{" "}
                    <a
                      href={admission.priorEducation.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {admission.priorEducation.value}
                    </a>
                  </p>
                )}
              <dl className={styles.metrics}>
                <Fact
                  label="Стоимость года"
                  field={master?.tuition ?? admission?.annualTuition}
                  price
                />
                <Fact
                  label="Бюджетные места"
                  field={master?.budgetPlaces ?? admission?.budgetPlaces}
                />
                <Fact
                  label="Платные места"
                  field={master?.paidPlaces ?? admission?.paidPlaces}
                />
              </dl>
              {exams?.status === "verified" && exams.value ? (
                <p className={styles.note}>
                  Отбор и испытания · {exams.year}:{" "}
                  <a href={exams.sourceUrl} target="_blank" rel="noreferrer">
                    {exams.value}
                  </a>
                </p>
              ) : (
                <p className={styles.note}>
                  Вступительные испытания и проходные баллы по этой программе
                  ещё не подтверждены.
                </p>
              )}
              {admission?.note && (
                <p className={styles.note}>{admission.note}</p>
              )}
              {row.programUrl && (
                <a
                  className={styles.action}
                  href={row.programUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Страница программы <span aria-hidden="true">↗</span>
                </a>
              )}
              <a
                className={styles.source}
                href={row.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Официальный перечень или документ
              </a>
              <Link
                className={styles.source}
                href={`/universities/${institution.universitySlug}`}
              >
                Карточка: {institution.universityName}
              </Link>
            </article>
          );
        })}
      </div>
      {view.matched === 0 && (
        <p className={styles.empty}>
          {view.total
            ? "По выбранным фильтрам записей нет. Попробуйте расширить поиск."
            : "Подтверждённые программы этого уровня ещё не добавлены. Это не означает, что учебные заведения их не предлагают."}
        </p>
      )}
      {view.matched > view.rows.length && (
        <Link
          className="button button-secondary"
          href={`/programs${pathwaySearch(track, query, {
            limit: String(Math.max(query.limit, PATHWAY_PAGE) + PATHWAY_STEP),
          })}`}
          scroll={false}
        >
          Показать ещё
        </Link>
      )}
    </section>
  );
}
