"use client";

import Link from "next/link";
import { universityViewSchema } from "@/lib/catalog/view-state";
import { useSavedFilters } from "./use-saved-filters";
import {
  filterUniversities,
  type UniversityCatalogEntry,
} from "@/lib/university-catalog-filters";
import styles from "@/app/universities/directory.module.css";
import { UniversityLogo } from "./university-logo";

const PAGE_SIZE = 24;

export function UniversityCatalog({
  entries,
  initialView,
}: {
  initialView?: string;
  entries: UniversityCatalogEntry[];
}) {
  const [view, setView] = useSavedFilters(
    "/universities",
    universityViewSchema,
    "",
    initialView,
  );
  const { query, city, ownership, detailsFilter, limit } = view;
  const cities = [...new Set(entries.map((entry) => entry.city))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  function update<K extends keyof typeof view>(
    key: K,
    value: (typeof view)[K],
  ) {
    setView((current) => ({
      ...current,
      [key]: value,
      ...(key === "limit" ? {} : { limit: PAGE_SIZE }),
    }));
  }
  const filtered = filterUniversities(entries, view);
  return (
    <div className={styles.directory}>
      <aside
        className={`university-directory-controls ${styles.filters}`}
        aria-labelledby="university-filters-title"
      >
        <h2 id="university-filters-title">Поиск и фильтры</h2>
        <div>
          <label htmlFor="university-search">Найти вуз</label>
          <input
            id="university-search"
            maxLength={200}
            type="search"
            value={query}
            placeholder="Название, город или адрес"
            onChange={(event) => {
              update("query", event.target.value);
            }}
          />
        </div>
        <div>
          <label htmlFor="university-city">Город</label>
          <select
            id="university-city"
            value={city}
            onChange={(event) => update("city", event.target.value)}
          >
            <option value="all">Все города</option>
            {city !== "all" && !cities.includes(city) && (
              <option value={city}>{city} · нет записей</option>
            )}
            {cities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="university-ownership">Тип вуза</label>
          <select
            id="university-ownership"
            value={ownership}
            onChange={(event) => {
              update("ownership", event.target.value as typeof ownership);
            }}
          >
            <option value="all">Все вузы</option>
            <option value="state">Государственные</option>
            <option value="private">Негосударственные</option>
          </select>
        </div>
        <div>
          <label htmlFor="university-details-filter">Сведения в карточке</label>
          <select
            id="university-details-filter"
            value={detailsFilter}
            onChange={(event) => {
              update(
                "detailsFilter",
                event.target.value as typeof detailsFilter,
              );
            }}
          >
            <option value="all">Все карточки</option>
            <option value="contacts">Есть общие контакты</option>
            <option value="offerings">Есть перечень направлений</option>
            <option value="faculties">Есть факультеты и институты</option>
            <option value="extract">Есть выписка о лицензии</option>
          </select>
        </div>
        <p className="filter-persistence-note">
          Поиск и фильтры сохраняются при возвращении в каталог.
        </p>
      </aside>
      <section className={styles.results} aria-label="Результаты поиска">
        <div className={styles.resultsHeading}>
          <span>Вузы и филиалы</span>
          <p role="status">
            Найдено: {filtered.length} из {entries.length}
          </p>
        </div>
        {filtered.length > 0 && (
          <div className={styles.columnLabels} aria-hidden="true">
            <span>Вуз и город</span>
            <span>Данные каталога</span>
            <span>Ссылки</span>
          </div>
        )}
        <div className={`university-grid ${styles.entries}`}>
          {filtered.slice(0, limit).map((u) => (
            <article className={`university-card ${styles.row}`} key={u.id}>
              <div className={styles.institution}>
                <UniversityLogo university={u} size="row" />
                <div>
                  <p className={styles.identity}>
                    <span>{u.shortName}</span>
                    <span>{u.city}</span>
                    {u.directory?.kind === "branch" && <span>Филиал</span>}
                    {u.militaryCenter === true && (
                      <span className={styles.military}>Есть ВУЦ</span>
                    )}
                  </p>
                  <h2>
                    <Link prefetch={false} href={`/universities/${u.slug}`}>
                      {u.name}
                    </Link>
                  </h2>
                  <p className={styles.description}>{u.description}</p>
                </div>
              </div>
              <div className={styles.evidence}>
                <strong>
                  {u.catalogProgramCount > 0
                    ? `Программ в каталоге: ${u.catalogProgramCount}`
                    : u.campaignCount > 0
                      ? `Групп с условиями приёма 2026: ${u.campaignCount}`
                      : u.offeringCount > 0
                        ? `Направлений и профилей в перечне: ${u.offeringCount}`
                        : "Программы ещё не добавлены"}
                </strong>
                <span>
                  {u.evidence.fieldCount > 0
                    ? `Собрано сведений: ${u.evidence.fieldCount}`
                    : "Подробные сведения уточняются"}
                </span>
                {u.facultyCount > 0 && (
                  <span>Факультетов и институтов: {u.facultyCount}</span>
                )}
                {u.evidence.checkedAt && (
                  <span>
                    Проверка сведений:{" "}
                    {new Date(u.evidence.checkedAt).toLocaleDateString(
                      "ru-RU",
                      { timeZone: "Europe/Moscow" },
                    )}
                  </span>
                )}
                <span>
                  {u.evidence.licenseAsOf
                    ? `Выписка о лицензии от ${new Date(u.evidence.licenseAsOf).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}. Текущий статус не подтверждён`
                    : "Текущий статус лицензии не подтверждён"}
                </span>
              </div>
              <div className={styles.actions}>
                <Link prefetch={false} href={`/universities/${u.slug}`}>
                  Открыть вуз
                </Link>
                <a href={u.website} target="_blank" rel="noreferrer">
                  Сайт вуза ↗
                </a>
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className={`university-directory-empty ${styles.empty}`}>
            <h2>Вуз не найден</h2>
            <p>Попробуйте другое название или измените город и фильтры.</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setView(universityViewSchema.parse({}));
              }}
            >
              Сбросить поиск
            </button>
          </div>
        )}
        {limit < filtered.length && (
          <button
            className="button button-secondary university-directory-more"
            onClick={() => update("limit", limit + PAGE_SIZE)}
          >
            Показать ещё · {Math.min(PAGE_SIZE, filtered.length - limit)}
          </button>
        )}
      </section>
    </div>
  );
}
