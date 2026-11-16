"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Program } from "@/lib/data";
import type { SourcedValue } from "@/lib/admissions/types";
import type { HseMasterTuition } from "@/lib/hse-admissions";
import type { UniversityOffering } from "@/lib/university-directory-details";
import { formatPrice } from "@/lib/catalog/format";
import styles from "./hse-program-explorer.module.css";

type ExplorerRow = {
  id: string;
  title: string;
  code: string;
  campus: string;
  level: string;
  form: string;
  duration: string | null;
  faculty: string | null;
  sourceUrl: string;
  programUrl: string | null;
  program?: Program;
  offering?: UniversityOffering;
  masterTuition?: HseMasterTuition;
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();

function programmeUrl(value: string) {
  const url = new URL(value);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/(admission|tracks)\/?$/, "").replace(/\/$/, "")}`;
}

function masterIdentity(row: {
  title: string;
  code: string;
  campus: string;
  form: string;
}) {
  return JSON.stringify(
    [row.title, row.code, row.campus, row.form].map(normalize),
  );
}

function latestScore(points: SourcedValue<number>[]) {
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
  field?: SourcedValue<number>;
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
          <span className={styles.unknown}>Нет данных</span>
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
  programs: Program[];
  offerings: UniversityOffering[];
  masterTuition?: HseMasterTuition[];
}) {
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState("");
  const [level, setLevel] = useState("");
  const [limit, setLimit] = useState(12);
  const rows = useMemo(() => {
    const result: ExplorerRow[] = programs.map((program) => ({
      id: `program-${program.id}`,
      title: program.title,
      code: program.code,
      campus: program.campus ?? "Кампус уточняется",
      level: program.level,
      form: program.form,
      duration: program.duration,
      faculty: program.faculty,
      sourceUrl: program.sourceUrl,
      programUrl: program.admissionsUrl ?? program.sourceUrl,
      program,
    }));
    const catalogue = offerings.filter((offering) =>
      offering.sourceUrl.includes("/n/education/"),
    );
    const matchedTuition = new Set<string>();
    for (const offering of catalogue) {
      const title = offering.profile ?? offering.title;
      const campus = offering.campus ?? "Кампус уточняется";
      const published = programs.some(
        (program) =>
          normalize(program.code) === normalize(offering.code) &&
          normalize(program.campus ?? "") === normalize(campus) &&
          (normalize(program.title) === normalize(title) ||
            (offering.programUrl &&
              programmeUrl(program.admissionsUrl ?? program.sourceUrl) ===
                programmeUrl(offering.programUrl))),
      );
      if (published) continue;
      const identity = masterIdentity({
        title,
        code: offering.code,
        campus,
        form: offering.forms ?? "",
      });
      const tuition =
        offering.level === "Магистратура"
          ? masterTuition.find((row) => masterIdentity(row) === identity)
          : undefined;
      if (tuition) matchedTuition.add(identity);
      result.push({
        id: offering.id,
        title,
        code: offering.code,
        campus,
        level: offering.level,
        form: offering.forms ?? "Форма уточняется",
        duration: offering.duration,
        faculty: null,
        sourceUrl: offering.sourceUrl,
        programUrl: offering.programUrl ?? null,
        offering,
        masterTuition: tuition,
      });
    }
    for (const [index, tuition] of masterTuition.entries()) {
      if (matchedTuition.has(masterIdentity(tuition))) continue;
      result.push({
        id: `master-tuition-${index}`,
        title: tuition.title,
        code: tuition.code,
        campus: tuition.campus,
        level: "Магистратура",
        form: tuition.form,
        duration: null,
        faculty: null,
        sourceUrl: tuition.sourceUrl,
        programUrl: tuition.programUrl,
        masterTuition: tuition,
      });
    }
    return result.sort((left, right) =>
      left.title.localeCompare(right.title, "ru"),
    );
  }, [programs, offerings, masterTuition]);
  const term = normalize(query);
  const filtered = rows.filter(
    (row) =>
      (!campus || row.campus === campus) &&
      (!level || row.level === level) &&
      normalize(
        `${row.title} ${row.code} ${row.campus} ${row.faculty ?? ""} ${row.offering?.title ?? ""} ${row.program?.tags.join(" ") ?? ""}`,
      ).includes(term),
  );
  const campuses = [...new Set(rows.map((row) => row.campus))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const levels = ["Бакалавриат", "Специалитет", "Магистратура"];

  return (
    <section
      id="programs"
      className={styles.explorer}
      aria-labelledby="hse-programs-heading"
    >
      <div className={styles.heading}>
        <div>
          <h2 id="hse-programs-heading">Программы ВШЭ</h2>
          <p>Бакалавриат, специалитет и магистратура четырёх кампусов.</p>
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
      </div>
      <div className={styles.results}>
        <p role="status">
          Найдено программ и направлений {filtered.length} из {rows.length}
        </p>
        {(query || campus || level) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCampus("");
              setLevel("");
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
                  aria-label={`Открыть ${row.title}`}
                >
                  Условия поступления и проверка баллов →
                </Link>
              </>
            ) : (
              <>
                {row.masterTuition ? (
                  <dl className={styles.metrics}>
                    <Metric
                      label="Стоимость года"
                      field={row.masterTuition.tuition}
                      price
                    />
                    <Metric
                      label="Бюджетные места"
                      field={row.masterTuition.budgetPlaces}
                    />
                    <Metric
                      label="Платные места"
                      field={row.masterTuition.paidPlaces}
                    />
                  </dl>
                ) : (
                  <p className={styles.unknown}>Условия приёма проверяются.</p>
                )}
                {row.masterTuition?.exams.value && (
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
                {row.offering && (
                  <p className={styles.note}>
                    Год набора в общем каталоге не указан.
                  </p>
                )}
                {!row.offering && row.masterTuition && (
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
                    Программа на сайте ВШЭ ↗
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
