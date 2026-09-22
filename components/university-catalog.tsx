"use client";

import Link from "next/link";
import { useState } from "react";
import type { University } from "@/lib/data";
import type { directoryEvidenceSummary } from "@/lib/university-directory-details";
import { UniversityLogo } from "./university-logo";

const PAGE_SIZE = 24;

export function UniversityCatalog({
  entries,
}: {
  entries: Array<
    University & {
      catalogProgramCount: number;
      offeringCount: number;
      campaignCount: number;
      evidence: ReturnType<typeof directoryEvidenceSummary>;
    }
  >;
}) {
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState("all");
  const [detailsFilter, setDetailsFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е");
  const filtered = entries.filter(
    (u) =>
      `${u.name} ${u.shortName} ${u.directory?.legalName ?? ""} ${u.address}`
        .toLocaleLowerCase("ru")
        .replaceAll("ё", "е")
        .includes(normalizedQuery) &&
      (ownership === "all" || u.directory?.ownership === ownership) &&
      (detailsFilter === "all" ||
        (detailsFilter === "contacts" && u.evidence.hasContacts) ||
        (detailsFilter === "offerings" && u.offeringCount > 0) ||
        (detailsFilter === "extract" && u.evidence.licenseAsOf !== null)),
  );
  return (
    <>
      <div className="university-directory-controls">
        <label>
          Найти вуз
          <input
            type="search"
            value={query}
            placeholder="Название, сокращение или адрес"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </label>
        <label>
          Тип вуза
          <select
            value={ownership}
            onChange={(event) => {
              setOwnership(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">Все вузы</option>
            <option value="state">Государственные</option>
            <option value="private">Негосударственные</option>
          </select>
        </label>
        <label>
          Сведения в карточке
          <select
            value={detailsFilter}
            onChange={(event) => {
              setDetailsFilter(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">Все карточки</option>
            <option value="contacts">Есть общие контакты</option>
            <option value="offerings">Есть перечень направлений</option>
            <option value="extract">Есть выписка о лицензии</option>
          </select>
        </label>
        <p role="status">
          Найдено: {filtered.length} из {entries.length}
        </p>
      </div>
      <div className="university-grid">
        {filtered.slice(0, limit).map((u) => (
          <article className="university-card university-card-rich" key={u.id}>
            <div className="university-card-top">
              <UniversityLogo university={u} />
              <div className="university-card-kicker">
                <span>{u.shortName}</span>
                <small>
                  {u.city}
                  {u.directory?.kind === "branch" ? " · филиал" : ""}
                </small>
              </div>
              {u.militaryCenter === true && (
                <span className="university-vuc-badge">Есть ВУЦ</span>
              )}
            </div>
            <div>
              <h2>
                <Link href={`/universities/${u.slug}`}>{u.name}</Link>
              </h2>
              <p>{u.description}</p>
            </div>
            <div className="university-card-evidence">
              <span>
                {u.evidence.fieldCount > 0
                  ? `Собрано сведений: ${u.evidence.fieldCount}`
                  : "Подробные сведения уточняются"}
              </span>
              {u.evidence.checkedAt && (
                <small>
                  Проверка сведений:{" "}
                  {new Date(u.evidence.checkedAt).toLocaleDateString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                </small>
              )}
              <small>
                {u.evidence.licenseAsOf
                  ? `Выписка о лицензии от ${new Date(u.evidence.licenseAsOf).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}; текущий статус не подтверждён`
                  : "Текущий статус лицензии не подтверждён"}
              </small>
            </div>
            <div className="university-meta">
              <span>
                {u.catalogProgramCount > 0
                  ? `Программ в каталоге: ${u.catalogProgramCount}`
                  : u.campaignCount > 0
                    ? `Групп с условиями приёма 2026: ${u.campaignCount}`
                    : u.offeringCount > 0
                      ? `Направлений и профилей в перечне: ${u.offeringCount}`
                      : "Программы ещё не добавлены"}
              </span>
              <a href={u.website} target="_blank" rel="noreferrer">
                Сайт вуза ↗
              </a>
              <Link href={`/universities/${u.slug}`}>Открыть вуз →</Link>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="university-directory-empty">
          <h2>Вуз не найден</h2>
          <p>Попробуйте полное название или другое сокращение.</p>
          <button
            className="button button-secondary"
            onClick={() => {
              setQuery("");
              setOwnership("all");
              setDetailsFilter("all");
              setLimit(PAGE_SIZE);
            }}
          >
            Сбросить поиск
          </button>
        </div>
      )}
      {limit < filtered.length && (
        <button
          className="button button-secondary university-directory-more"
          onClick={() => setLimit(limit + PAGE_SIZE)}
        >
          Показать ещё · {Math.min(PAGE_SIZE, filtered.length - limit)}
        </button>
      )}
    </>
  );
}
