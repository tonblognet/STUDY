"use client";

import { useState } from "react";
import {
  filterUniversityFaculties,
  type FacultyListItem,
} from "@/lib/university-faculties";

const PAGE_SIZE = 12;

export function UniversityFaculties({ rows }: { rows: FacultyListItem[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filtered = filterUniversityFaculties(rows, query);
  return (
    <section
      id="faculties"
      className="university-education-areas university-faculties"
      aria-labelledby="faculties-heading"
    >
      <h3 id="faculties-heading">Факультеты и институты · {rows.length}</h3>
      <p>
        Учебные подразделения по официальной структуре вуза: факультеты,
        институты, школы и кафедры. Список может быть неполным; наличие
        подразделения не подтверждает набор на конкретную программу.
      </p>
      <label className="university-offering-search">
        Поиск по факультетам и институтам
        <input
          type="search"
          maxLength={200}
          value={query}
          placeholder="Название факультета, института или школы"
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
      </label>
      <p role="status">
        Найдено подразделений: {filtered.length} из {rows.length}
      </p>
      <ul className="university-faculty-list">
        {filtered.slice(0, limit).map((faculty) => (
          <li key={faculty.name}>
            {faculty.url ? (
              <a href={faculty.url} target="_blank" rel="noreferrer">
                {faculty.name} ↗
              </a>
            ) : (
              <strong>{faculty.name}</strong>
            )}
            <small>
              <a href={faculty.sourceUrl} target="_blank" rel="noreferrer">
                Официальный источник
              </a>{" "}
              · проверено{" "}
              {new Date(faculty.checkedAt).toLocaleDateString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}
            </small>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <div className="university-faculty-empty">
          <p>Подразделение не найдено. Попробуйте другое название.</p>
          <button
            className="button button-secondary"
            onClick={() => {
              setQuery("");
              setLimit(PAGE_SIZE);
            }}
          >
            Сбросить поиск подразделений
          </button>
        </div>
      )}
      {filtered.length > limit && (
        <button
          className="button button-secondary"
          onClick={() => setLimit(limit + PAGE_SIZE)}
        >
          Показать ещё {Math.min(PAGE_SIZE, filtered.length - limit)}{" "}
          подразделений
        </button>
      )}
    </section>
  );
}
