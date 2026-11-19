"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  HseDisplayFact,
  HseExplorerProgram,
  HseExplorerOffering,
  HseExplorerMaster,
  HseStudyMode,
  HseExplorerFilters,
} from "@/lib/hse-explorer-data";
import {
  filterHseExplorerRows,
  hseAdmissionYears,
  hseCampusNames,
  hseExplorerRows,
  hseHasKnownConditions,
  hseStudyModes,
} from "@/lib/hse-explorer-data";
import { formatPrice } from "@/lib/catalog/format";
import styles from "./hse-program-explorer.module.css";

function latestScore(points: HseDisplayFact<number>[]) {
  return points
    .filter((point) => point.status === "verified" && point.value !== null)
    .sort((left, right) => right.year - left.year)[0];
}

function Metric({
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
              {price ? formatPrice(field.value) : field.value}
            </a>
            <small>{field.year} · официальный источник ↗</small>
          </>
        ) : (
          <span className={styles.unknown}>
            {field?.status === "not_applicable"
              ? "Не применяется"
              : "Нет данных"}
          </span>
        )}
      </dd>
    </div>
  );
}

export function HseProgramExplorer({
  programs,
  offerings,
  masterTuition = [],
}: {
  programs: HseExplorerProgram[];
  offerings: HseExplorerOffering[];
  masterTuition?: HseExplorerMaster[];
}) {
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState("");
  const [level, setLevel] = useState("");
  const [faculty, setFaculty] = useState("");
  const [form, setForm] = useState<HseStudyMode | "">("");
  const [funding, setFunding] = useState<HseExplorerFilters["funding"]>("");
  const [maxTuition, setMaxTuition] = useState("");
  const [year, setYear] = useState("");
  const [conditions, setConditions] =
    useState<HseExplorerFilters["conditions"]>("");
  const [limit, setLimit] = useState(12);
  const rows = useMemo(
    () => hseExplorerRows(programs, offerings, masterTuition),
    [programs, offerings, masterTuition],
  );
  const filtered = filterHseExplorerRows(rows, {
    query,
    campus,
    level,
    faculty,
    form,
    funding,
    maxTuition,
    year,
    conditions,
  });
  const campuses = [
    ...new Set(rows.flatMap((row) => hseCampusNames(row.campus))),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const levels = [...new Set(rows.map((row) => row.level))];
  const faculties = [
    ...new Set(rows.flatMap((row) => (row.faculty ? [row.faculty] : []))),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const forms = (
    ["Очная", "Очно-заочная", "Заочная", "Онлайн"] as const
  ).filter((name) => rows.some((row) => hseStudyModes(row).includes(name)));
  const years = [...new Set(rows.flatMap(hseAdmissionYears))].sort(
    (a, b) => b - a,
  );
  const activeFilters =
    query ||
    campus ||
    level ||
    faculty ||
    form ||
    funding ||
    maxTuition ||
    year ||
    conditions;

  return (
    <section
      id="programs"
      className={styles.explorer}
      aria-labelledby="hse-programs-heading"
    >
      <div className={styles.heading}>
        <div>
          <h2 id="hse-programs-heading">Программы ВШЭ</h2>
          <p>
            Программы и направления всех кампусов с официальными источниками.
          </p>
        </div>
        <a
          href="https://www.hse.ru/n/education/"
          target="_blank"
          rel="noreferrer"
        >
          Каталог ВШЭ ↗
        </a>
      </div>
      <div className={styles.controls}>
        <label>
          Найти программу ВШЭ
          <input
            type="search"
            value={query}
            placeholder="Название, код или факультет"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(12);
            }}
          />
        </label>
        <label>
          Кампус ВШЭ
          <select
            aria-label="Кампус ВШЭ"
            value={campus}
            onChange={(event) => {
              setCampus(event.target.value);
              setLimit(12);
            }}
          >
            <option value="">Все кампусы</option>
            {campuses.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Уровень образования ВШЭ
          <select
            aria-label="Уровень образования ВШЭ"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setLimit(12);
            }}
          >
            <option value="">Все уровни</option>
            {levels.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Подразделение ВШЭ
          <select
            aria-label="Подразделение ВШЭ"
            value={faculty}
            onChange={(event) => {
              setFaculty(event.target.value);
              setLimit(12);
            }}
          >
            <option value="">Все подразделения</option>
            {faculties.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Форма обучения ВШЭ
          <select
            aria-label="Форма обучения ВШЭ"
            value={form}
            onChange={(event) => {
              setForm(event.target.value as HseStudyMode | "");
              setLimit(12);
            }}
          >
            <option value="">Любая форма</option>
            {forms.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Оплата обучения ВШЭ
          <select
            aria-label="Оплата обучения ВШЭ"
            value={funding}
            onChange={(event) => {
              setFunding(event.target.value as HseExplorerFilters["funding"]);
              setLimit(12);
            }}
          >
            <option value="">Любой вариант</option>
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
            inputMode="numeric"
            value={maxTuition}
            placeholder="Без ограничения"
            aria-describedby="hse-filter-evidence"
            onChange={(event) => {
              setMaxTuition(event.target.value);
              setLimit(12);
            }}
          />
        </label>
        <label>
          Год набора ВШЭ
          <select
            aria-label="Год набора ВШЭ"
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setLimit(12);
            }}
          >
            <option value="">Все годы, включая неуказанные</option>
            {years.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Известные условия ВШЭ
          <select
            aria-label="Известные условия ВШЭ"
            value={conditions}
            onChange={(event) => {
              setConditions(
                event.target.value as HseExplorerFilters["conditions"],
              );
              setLimit(12);
            }}
          >
            <option value="">Все записи</option>
            <option value="known">Есть подтверждённые условия</option>
            <option value="needs-review">Условия нужно сверить</option>
          </select>
        </label>
      </div>
      <p id="hse-filter-evidence" className={styles.filterNote}>
        Места, стоимость года и год набора фильтруются по подтверждённым данным.
        Цены отдельных курсов не считаются годовой стоимостью. Неизвестные
        значения остаются в общей выдаче. Онлайн может сочетаться с очной
        формой.
      </p>
      <div className={styles.results}>
        <p role="status">
          Найдено программ и направлений {filtered.length} из {rows.length}
        </p>
        {activeFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCampus("");
              setLevel("");
              setFaculty("");
              setForm("");
              setFunding("");
              setMaxTuition("");
              setYear("");
              setConditions("");
              setLimit(12);
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>
      <div className={styles.cards}>
        {filtered.slice(0, limit).map((row) => (
          <article className={styles.card} key={row.id}>
            <div className={styles.identity}>
              <p className={styles.classification}>
                {row.campus} · {row.level} · {row.code}
              </p>
              <h3>{row.title}</h3>
              {row.faculty && <p>{row.faculty}</p>}
              <p className={styles.conditionStatus}>
                {hseHasKnownConditions(row)
                  ? "Есть подтверждённые условия"
                  : "Условия приёма нужно сверить"}
              </p>
              <p>
                {row.form}
                {row.duration && ` · ${row.duration}`}
              </p>
            </div>
            {row.program ? (
              <>
                <dl className={styles.metrics}>
                  <Metric
                    label="Стоимость года"
                    field={row.program.tuitionValue}
                    price
                  />
                  <Metric
                    label="Бюджетные места"
                    field={row.program.budgetPlacesValue}
                  />
                  <Metric
                    label="Платные места"
                    field={row.program.paidPlacesValue}
                  />
                  <Metric
                    label="Проходной на бюджет"
                    field={latestScore([
                      ...row.program.passingHistory,
                      row.program.passingScoreValue,
                    ])}
                  />
                  <Metric
                    label="Проходной на платное"
                    field={latestScore(row.program.paidPassingHistory ?? [])}
                  />
                </dl>
                <Link
                  className={styles.action}
                  href={`/programs/${row.program.slug}`}
                  aria-label={`Условия поступления и проверка баллов — ${row.title}`}
                >
                  Условия поступления и проверка баллов{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : (
              <>
                {row.offering?.profile &&
                  row.offering.profile !== row.title && (
                    <p className={styles.note}>{row.offering.profile}</p>
                  )}
                {row.masterTuition || row.admission ? (
                  <dl className={styles.metrics}>
                    <Metric
                      label="Стоимость года"
                      field={
                        row.masterTuition?.tuition ??
                        row.admission?.annualTuition
                      }
                      price
                    />
                    <Metric
                      label="Бюджетные места"
                      field={
                        row.masterTuition?.budgetPlaces ??
                        row.admission?.budgetPlaces
                      }
                    />
                    <Metric
                      label="Платные места"
                      field={
                        row.masterTuition?.paidPlaces ??
                        row.admission?.paidPlaces
                      }
                    />
                  </dl>
                ) : (
                  <p className={styles.unknown}>Условия приёма проверяются.</p>
                )}
                {!row.masterTuition && row.offering?.publishedPrice && (
                  <p className={styles.note}>
                    Стоимость в каталоге —{" "}
                    <a
                      href={row.offering.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {new Intl.NumberFormat("ru-RU").format(
                        row.offering.publishedPrice.amount,
                      )}{" "}
                      {row.offering.publishedPrice.currency}
                      {row.offering.publishedPrice.period
                        ? ` · ${row.offering.publishedPrice.period}`
                        : " · период оплаты не указан"}
                    </a>
                  </p>
                )}
                {row.masterTuition?.exams.status === "verified" &&
                  row.masterTuition.exams.value && (
                    <p className={styles.note}>
                      Испытания {row.masterTuition.exams.year} года —{" "}
                      <a
                        href={row.masterTuition.exams.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.masterTuition.exams.value}
                      </a>
                    </p>
                  )}
                {!row.masterTuition &&
                  row.admission?.exams?.status === "verified" &&
                  row.admission.exams.value && (
                    <p className={styles.note}>
                      Испытания {row.admission.exams.year} года —{" "}
                      <a
                        href={row.admission.exams.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.admission.exams.value}
                      </a>
                    </p>
                  )}
                {row.admission?.priorEducation && (
                  <p className={styles.note}>
                    Предыдущее образование —{" "}
                    {row.admission.priorEducation.status === "verified" &&
                    row.admission.priorEducation.value ? (
                      <a
                        href={row.admission.priorEducation.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.admission.priorEducation.value}
                      </a>
                    ) : (
                      "требуется сверка"
                    )}
                  </p>
                )}
                {row.admission?.schoolBase && (
                  <p className={styles.note}>
                    На базе {row.admission.schoolBase} классов.
                  </p>
                )}
                {row.admission?.note && (
                  <p className={styles.note}>{row.admission.note}</p>
                )}
                {!hseAdmissionYears(row).length && (
                  <p className={styles.note}>
                    Год набора в общем каталоге не указан.
                  </p>
                )}
                {row.masterTuition && (
                  <p className={styles.note}>
                    Перечень стоимости для поступающих в{" "}
                    {row.masterTuition.tuition.year} году.
                  </p>
                )}
                {row.programUrl && (
                  <a
                    className={styles.action}
                    href={row.programUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Страница программы ↗
                  </a>
                )}
                <a
                  className={styles.source}
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Официальный перечень ↗
                </a>
              </>
            )}
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className={styles.empty}>
          Программы не найдены. Измените запрос или фильтры.
        </p>
      )}
      {filtered.length > limit && (
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setLimit((current) => current + 12)}
        >
          Показать ещё {Math.min(12, filtered.length - limit)}
        </button>
      )}
    </section>
  );
}
