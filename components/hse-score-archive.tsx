"use client";

import { useState } from "react";
import styles from "./hse-score-archive.module.css";

type ArchiveStatus =
  | "verified"
  | "unknown"
  | "not_applicable"
  | "pending_review";

type ArchiveScore = {
  value: number | null;
  status: ArchiveStatus;
  raw?: string;
  rawPublishedValue?: number;
  maximum?: number | null;
  noteRu: string;
};

export type HseScoreArchiveRecord = {
  id: string;
  title: string;
  code: string | null;
  codes?: string[];
  campus: string;
  year: number;
  level?: "Бакалавриат и специалитет" | "Магистратура";
  programUrls: string[];
  budget: ArchiveScore;
  paid: ArchiveScore;
  source: string;
  scopeNoteRu: string;
  identityNoteRu?: string;
  pageOneBased?: number;
};

export type ArchiveData = {
  records: HseScoreArchiveRecord[];
  sources: Record<string, { url: string }>;
  knownConflicts: {
    title: string;
    code: string;
    year: number;
    facultyUnassigned?: number;
    noteRu: string;
    sourceUrls: string[];
  }[];
};

const PAGE_SIZE = 12;
const STATUS_LABELS: Record<ArchiveStatus, string> = {
  verified: "Опубликовано",
  unknown: "Не опубликован",
  not_applicable: "Без числового проходного",
  pending_review: "Требует сверки",
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
}

function FundingScore({
  label,
  score,
}: {
  label: string;
  score: ArchiveScore;
}) {
  const verified = score.status === "verified" && score.value !== null;
  const raw = score.raw ?? score.rawPublishedValue?.toString();
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {verified ? (
          <>
            <strong className={styles.value}>{score.value}</strong>
            {score.maximum && (
              <span className={styles.maximum}> из {score.maximum}</span>
            )}
            <span className={styles.status}>{STATUS_LABELS[score.status]}</span>
          </>
        ) : (
          <strong className={styles.unavailable}>
            {STATUS_LABELS[score.status]}
          </strong>
        )}
        {raw && raw !== score.value?.toString() && (
          <span className={styles.note}>В источнике «{raw}».</span>
        )}
        {score.noteRu && <span className={styles.note}>{score.noteRu}</span>}
      </dd>
    </div>
  );
}

export function HseScoreArchive({
  data: archive,
  rows = archive.records,
}: {
  data: ArchiveData;
  rows?: readonly HseScoreArchiveRecord[];
}) {
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState("all");
  const [year, setYear] = useState("all");
  const [level, setLevel] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const campuses = [...new Set(rows.map((row) => row.campus))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => b - a);
  const levels = [
    ...new Set(rows.map((row) => row.level ?? "Бакалавриат и специалитет")),
  ];
  const term = normalize(query);
  const filtered = rows
    .filter(
      (row) =>
        (campus === "all" || row.campus === campus) &&
        (year === "all" || row.year.toString() === year) &&
        (level === "all" ||
          (row.level ?? "Бакалавриат и специалитет") === level) &&
        normalize(
          `${row.title} ${row.code ?? ""} ${(row.codes ?? []).join(" ")}`,
        ).includes(term),
    )
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.campus.localeCompare(b.campus, "ru") ||
        a.title.localeCompare(b.title, "ru") ||
        (a.code ?? "").localeCompare(b.code ?? ""),
    );

  return (
    <section className={styles.archive} aria-labelledby="hse-score-heading">
      <div className={styles.intro}>
        <h2 id="hse-score-heading">Архив проходных баллов ВШЭ</h2>
        <p>
          Доступные официальные итоги приёма по годам. Выберите кампус и год,
          чтобы увидеть бюджетный и платный результаты с областью конкурса.
          Шкала баллов сохранена по источнику каждого года.
        </p>
      </div>
      <div className={styles.filters}>
        <label htmlFor="hse-score-query">
          Поиск по программам
          <input
            id="hse-score-query"
            type="search"
            maxLength={200}
            placeholder="Название или код направления"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </label>
        <label htmlFor="hse-score-campus">
          Кампус
          <select
            id="hse-score-campus"
            aria-label="Кампус архива ВШЭ"
            value={campus}
            onChange={(event) => {
              setCampus(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">Все кампусы</option>
            {campuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="hse-score-year">
          Год приёма
          <select
            id="hse-score-year"
            aria-label="Год приёма в архиве ВШЭ"
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">Все годы</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="hse-score-level">
          Уровень образования
          <select
            id="hse-score-level"
            aria-label="Уровень образования в архиве ВШЭ"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">Все уровни</option>
            {levels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <p className={styles.count} role="status" aria-live="polite">
        Найдено конкурсов {filtered.length} из {rows.length}
      </p>
      <div className={styles.results}>
        {filtered.slice(0, limit).map((row) => {
          const codes = row.codes?.length ? row.codes : [row.code];
          const conflicts = archive.knownConflicts.filter(
            (conflict) =>
              row.campus === "Москва" &&
              row.level !== "Магистратура" &&
              row.year === conflict.year &&
              row.title.startsWith(conflict.title) &&
              (codes.includes(conflict.code) ||
                conflict.facultyUnassigned !== undefined),
          );
          return (
            <article key={row.id} className={styles.record}>
              <div className={styles.identity}>
                <p className={styles.meta}>
                  <span>{row.campus}</span>
                  <span>{row.year}</span>
                  <span>{row.level ?? "Бакалавриат и специалитет"}</span>
                </p>
                <h3>{row.title}</h3>
                {codes.some(Boolean) ? (
                  <p className={styles.codes}>
                    {codes.filter(Boolean).join(" / ")}
                  </p>
                ) : (
                  <p className={styles.note}>
                    Код не указан в историческом источнике.
                  </p>
                )}
                {row.scopeNoteRu && (
                  <p className={styles.scope}>{row.scopeNoteRu}</p>
                )}
                {row.identityNoteRu && (
                  <p className={styles.note}>{row.identityNoteRu}</p>
                )}
              </div>
              <dl className={styles.scores}>
                <FundingScore label="Бюджет" score={row.budget} />
                <FundingScore label="Платное обучение" score={row.paid} />
              </dl>
              <div className={styles.sources}>
                <a
                  href={archive.sources[row.source].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Официальная сводка ↗
                </a>
                {row.programUrls[0] && (
                  <a href={row.programUrls[0]} target="_blank" rel="noreferrer">
                    Страница программы ↗
                  </a>
                )}
                {row.pageOneBased && <span>Страница {row.pageOneBased}</span>}
              </div>
              {conflicts.map((conflict) => (
                <details
                  className={styles.conflict}
                  key={`${conflict.code}-${conflict.year}`}
                >
                  <summary>Расхождение официальных источников</summary>
                  <p>{conflict.noteRu}</p>
                  <a
                    href={conflict.sourceUrls[1]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Диаграмма факультета ↗
                  </a>
                </details>
              ))}
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className={styles.empty}>
          Программы не найдены. Измените название, код, кампус или год.
        </p>
      )}
      {filtered.length > limit && (
        <button
          type="button"
          className={`button button-secondary ${styles.more}`}
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
        >
          Показать ещё {Math.min(PAGE_SIZE, filtered.length - limit)} конкурсов
        </button>
      )}
    </section>
  );
}
