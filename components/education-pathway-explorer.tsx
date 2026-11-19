"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EducationPathwayRow } from "@/lib/education-pathways";
import {
  filterHseExplorerRows,
  hseAdmissionYears,
  hseCampusNames,
  hseHasKnownConditions,
  hseStudyModes,
  type HseDisplayFact,
  type HseExplorerFilters,
} from "@/lib/hse-explorer-data";
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
  rows,
}: {
  rows: EducationPathwayRow[];
}) {
  const [filters, setFilters] = useState<HseExplorerFilters>({});
  const [university, setUniversity] = useState("");
  const [schoolBase, setSchoolBase] = useState("");
  const [limit, setLimit] = useState(12);
  const update = (key: keyof HseExplorerFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setLimit(12);
  };
  const universities = useMemo(
    () =>
      [
        ...new Map(
          rows.map((row) => [row.universitySlug, row.universityName]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1], "ru")),
    [rows],
  );
  const scoped = useMemo(
    () =>
      rows.filter((row) => !university || row.universitySlug === university),
    [rows, university],
  );
  const campuses = useMemo(
    () =>
      [...new Set(scoped.flatMap((row) => hseCampusNames(row.campus)))].sort(
        (a, b) => a.localeCompare(b, "ru"),
      ),
    [scoped],
  );
  const faculties = useMemo(
    () =>
      [
        ...new Set(
          scoped
            .map((row) => row.faculty)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, "ru")),
    [scoped],
  );
  const forms = useMemo(
    () => [...new Set(scoped.flatMap(hseStudyModes))],
    [scoped],
  );
  const years = useMemo(
    () => [...new Set(scoped.flatMap(hseAdmissionYears))].sort((a, b) => b - a),
    [scoped],
  );
  const filtered = useMemo(
    () =>
      filterHseExplorerRows(
        scoped.filter(
          (row) =>
            !schoolBase || row.admission?.schoolBase === Number(schoolBase),
        ),
        filters,
      ),
    [scoped, filters, schoolBase],
  );
  const identity = new Map(rows.map((row) => [row.id, row]));
  const hasFilters = Boolean(
    university || schoolBase || Object.values(filters).some(Boolean),
  );
  const reset = () => {
    setUniversity("");
    setSchoolBase("");
    setFilters({});
    setLimit(12);
  };
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
      <div className={styles.controls}>
        <label>
          Название или код программы
          <input
            type="search"
            value={filters.query ?? ""}
            onChange={(event) => update("query", event.target.value)}
            placeholder="Например, экономика"
          />
        </label>
        <label>
          Учебное заведение
          <select
            aria-label="Учебное заведение"
            value={university}
            onChange={(event) => {
              setUniversity(event.target.value);
              setFilters(({ query }) => ({ query }));
              setLimit(12);
            }}
          >
            <option value="">Все учебные заведения</option>
            {universities.map(([slug, name]) => (
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
            value={filters.campus ?? ""}
            onChange={(event) => update("campus", event.target.value)}
          >
            <option value="">Все города и кампусы</option>
            {campuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Подразделение
          <select
            aria-label="Подразделение"
            value={filters.faculty ?? ""}
            onChange={(event) => update("faculty", event.target.value)}
          >
            <option value="">Все подразделения, включая неуказанные</option>
            {faculties.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Форма обучения
          <select
            aria-label="Форма обучения"
            value={filters.form ?? ""}
            onChange={(event) => update("form", event.target.value)}
          >
            <option value="">Любая форма</option>
            {forms.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Финансирование
          <select
            aria-label="Финансирование"
            value={filters.funding ?? ""}
            onChange={(event) => update("funding", event.target.value)}
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
            min="0"
            step="10000"
            value={filters.maxTuition ?? ""}
            onChange={(event) => update("maxTuition", event.target.value)}
            placeholder="Без ограничения"
          />
        </label>
        <label>
          Год набора
          <select
            aria-label="Год набора"
            value={filters.year ?? ""}
            onChange={(event) => update("year", event.target.value)}
          >
            <option value="">Все годы, включая неуказанные</option>
            {years.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Наличие условий
          <select
            aria-label="Наличие условий"
            value={filters.conditions ?? ""}
            onChange={(event) => update("conditions", event.target.value)}
          >
            <option value="">Все записи</option>
            <option value="known">Есть подтверждённые условия</option>
            <option value="needs-review">Условия нужно сверить</option>
          </select>
        </label>
        {rows.some((row) => row.admission?.schoolBase) && (
          <label>
            Образование до колледжа
            <select
              aria-label="Образование до колледжа"
              value={schoolBase}
              onChange={(event) => {
                setSchoolBase(event.target.value);
                setLimit(12);
              }}
            >
              <option value="">Любое, включая неуказанное</option>
              <option value="9">После 9 классов</option>
              <option value="11">После 11 классов</option>
            </select>
          </label>
        )}
      </div>
      <p className={styles.filterNote}>
        Фильтры цены, финансирования и года учитывают подтверждённые условия
        конкретной программы. Год публикации перечня не считается годом набора.
        Записи без этих данных видны без ограничений.
      </p>
      <div className={styles.results}>
        <p role="status">
          Найдено записей: {filtered.length} из {rows.length}
        </p>
        {hasFilters && (
          <button type="button" onClick={reset}>
            Сбросить фильтры
          </button>
        )}
      </div>
      <div className={styles.cards}>
        {filtered.slice(0, limit).map((row) => {
          const institution = identity.get(row.id)!;
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
      {filtered.length === 0 && (
        <p className={styles.empty}>
          {rows.length
            ? "По выбранным фильтрам записей нет. Попробуйте расширить поиск."
            : "Подтверждённые программы этого уровня ещё не добавлены. Это не означает, что учебные заведения их не предлагают."}
        </p>
      )}
      {filtered.length > limit && (
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setLimit((value) => value + 24)}
        >
          Показать ещё
        </button>
      )}
    </section>
  );
}
