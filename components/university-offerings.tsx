"use client";

import { useState } from "react";
import type { UniversityOffering } from "@/lib/university-directory-details";

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
      className="university-offerings"
      aria-labelledby="offerings-heading"
    >
      <h2 id="offerings-heading">Направления из официального перечня</h2>
      <p>
        Вуз публикует эти программы в разделе «Образование». Набор на 2026 год,
        вступительные испытания, места и стоимость требуют отдельной проверки.
        Эти записи пока не участвуют в подборе по ЕГЭ.
      </p>
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
      <p role="status">
        Найдено направлений и профилей: {filtered.length} из {rows.length}
      </p>
      <div className="university-offering-grid">
        {filtered.slice(0, limit).map((row) => (
          <article key={row.id}>
            <span className="overline">
              {row.code} · {row.level}
            </span>
            <h3>{row.title}</h3>
            {row.profile && row.profile !== row.title && <p>{row.profile}</p>}
            <dl>
              <div>
                <dt>Формы обучения</dt>
                <dd>{row.forms ?? "Не указаны в проверенной строке"}</dd>
              </div>
              <div>
                <dt>Срок по источнику</dt>
                <dd>{row.duration ?? "Требует уточнения"}</dd>
              </div>
            </dl>
            <a href={row.sourceUrl} target="_blank" rel="noreferrer">
              Официальный перечень ↗
            </a>
            <small>
              Проверено{" "}
              {new Date(row.checkedAt).toLocaleDateString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}
              . Год набора не подтверждён.
            </small>
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
