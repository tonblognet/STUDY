"use client";

import { useState } from "react";
import type { UniversityOffering } from "@/lib/university-directory-details";
import styles from "./university-offerings.module.css";

export function UniversityOfferings({ rows }: { rows: UniversityOffering[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const term = query.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  const filtered = rows.filter((row) =>
    `${row.code} ${row.title} ${row.profile ?? ""} ${row.forms ?? ""}`
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е")
      .includes(term),
  );
  return (
    <section
      className={`university-offerings ${styles.offerings}`}
      aria-labelledby="offerings-heading"
    >
      <div className={styles.intro}>
        <div>
          <h2 id="offerings-heading">Направления из официального перечня</h2>
          <p>
            Вступительные испытания, места, стоимость и условия набора требуют
            отдельной проверки. Эти записи пока не участвуют в подборе по ЕГЭ.
          </p>
        </div>
        <label className="university-offering-search">
          Поиск по направлениям
          <input
            type="search"
            value={query}
            placeholder="Код, название или профиль"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(12);
            }}
          />
        </label>
      </div>
      <p role="status">
        Найдено направлений и профилей: {filtered.length} из {rows.length}
      </p>
      <div className="university-offering-grid">
        {filtered.slice(0, limit).map((row) => (
          <article key={row.id}>
            <div className={styles.identity}>
              <div className={styles.classification}>
                <span>{row.code}</span>
                <span>{row.level}</span>
              </div>
              <h3>{row.title}</h3>
              {row.profile && row.profile !== row.title && <p>{row.profile}</p>}
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Формы обучения</dt>
                <dd>{row.forms ?? "Не указаны в проверенной строке"}</dd>
              </div>
              <div>
                <dt>Срок по источнику</dt>
                <dd>{row.duration ?? "Требует уточнения"}</dd>
              </div>
            </dl>
            <div className={styles.source}>
              <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                Официальный перечень ↗
              </a>
              <small>
                Проверено{" "}
                {new Date(row.checkedAt).toLocaleDateString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })}
                .{" "}
                {row.sourceYear === null
                  ? "Год набора не подтверждён."
                  : `Перечень за ${row.sourceYear} год.`}
              </small>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <p>Направление не найдено. Попробуйте другой код или название.</p>
      )}
      {filtered.length > limit && (
        <button
          className="button button-secondary"
          onClick={() => setLimit(limit + 12)}
        >
          Показать ещё {Math.min(12, filtered.length - limit)} направлений
        </button>
      )}
    </section>
  );
}
