"use client";

import { useState } from "react";
import Link from "next/link";
import type { MguPassingScoreRecord } from "@/lib/mgu-data";
import type { ExamRequirement, SourcedValue } from "@/lib/admissions/types";
import type { Program } from "@/lib/data";
import { SourcedMetric } from "./data-status";
import { ProgramRequirement } from "./program-requirement";
import { ProgramContacts } from "./program-contacts";

export type MguProgramRow = {
  slug: string;
  title: string;
  faculty: string;
  code: string;
  level: string;
  description: string;
  budget: number | null;
  paid: number | null;
  budgetSource: SourcedValue<number>;
  paidSource: SourcedValue<number>;
  exams: string[];
  page: number;
  special: number | null;
  separate: number | null;
  target: number | null;
  requirements: ExamRequirement[];
  dviMinimum?: SourcedValue<number>;
  tuition: SourcedValue<number>;
  duration?: SourcedValue<string>;
  contact?: Program["admissionsContact"];
  sourceUrl: string;
};

const catalogSource = "https://cpk.msu.ru/files/2026/kcp_bak.pdf";
const matches = (value: string, query: string) =>
  value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .includes(query.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е"));

export function MguPrograms({ rows }: { rows: MguProgramRow[] }) {
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState("");
  const faculties = [...new Set(rows.map((row) => row.faculty))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const visible = rows.filter(
    (row) =>
      (!faculty || row.faculty === faculty) &&
      matches(
        `${row.title} ${row.code} ${row.faculty} ${row.description}`,
        query,
      ),
  );
  return (
    <section id="programs" className="mgu-section">
      <div className="university-section-head">
        <div>
          <span className="overline">
            Приём 2026 · бакалавриат и специалитет
          </span>
          <h2>Найдите своё направление</h2>
        </div>
        <a href={catalogSource} target="_blank" rel="noreferrer">
          План приёма МГУ ↗
        </a>
      </div>
      <p className="mgu-note">
        {rows.length} конкурсных групп, включая объединённые конкурсы. Число
        мест относится ко всей указанной группе. Магистратура, второе высшее и
        филиалы в этот каталог не входят.
      </p>
      <div className="mgu-controls">
        <label>
          Программа или код
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например, физика или 38.03.01"
          />
        </label>
        <label>
          Факультет
          <select value={faculty} onChange={(e) => setFaculty(e.target.value)}>
            <option value="">Все факультеты и школы</option>
            {faculties.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button
          className="button button-secondary"
          onClick={() => {
            setQuery("");
            setFaculty("");
          }}
        >
          Сбросить
        </button>
      </div>
      <p className="mgu-count" role="status">
        Найдено групп: {visible.length} из {rows.length}
      </p>
      <div className="mgu-programs">
        {visible.map((row) => (
          <details className="mgu-program" key={row.slug}>
            <summary>
              <div>
                <small>
                  {row.faculty} · {row.code}
                </small>
                <h3>{row.title}</h3>
                <span>{row.level} · очная форма</span>
              </div>
              <div className="mgu-places">
                <span>
                  <b>{row.budget ?? "—"}</b>бюджет
                </span>
                <span>
                  <b>{row.paid ?? "—"}</b>платно
                </span>
                <i aria-hidden="true">+</i>
              </div>
            </summary>
            <div className="mgu-program-body">
              <p>{row.description}</p>
              <div className="mgu-detail-grid">
                <div>
                  <h4>Вступительные испытания</h4>
                  <ol>
                    {row.exams.map((exam, index) => (
                      <li key={index}>{exam}</li>
                    ))}
                  </ol>
                  <p className="mgu-note">
                    Числа в скобках — приоритеты испытаний. Минимальные баллы
                    установлены{" "}
                    <a
                      href="https://cpk.msu.ru/files/2026/minimum.pdf"
                      target="_blank"
                      rel="noreferrer"
                    >
                      отдельным документом МГУ ↗
                    </a>
                    .
                  </p>
                </div>
                <div>
                  <h4>Квоты внутри бюджета</h4>
                  <dl className="mgu-quota-list">
                    <div>
                      <dt>Особая</dt>
                      <dd>{row.special ?? "Не выделена"}</dd>
                    </div>
                    <div>
                      <dt>Отдельная</dt>
                      <dd>{row.separate ?? "Не выделена"}</dd>
                    </div>
                    <div>
                      <dt>Детализированная целевая</dt>
                      <dd>{row.target ?? "Не выделена"}</dd>
                    </div>
                  </dl>
                  <p className="mgu-note">
                    Квоты входят в бюджетные места. Итоговое число мест общего
                    конкурса требует отдельной сверки.
                  </p>
                </div>
              </div>
              <div className="mgu-detail-grid">
                <SourcedMetric
                  label="Бюджетные места"
                  field={row.budgetSource}
                />
                <SourcedMetric label="Платные места" field={row.paidSource} />
              </div>
              <div className="mgu-detail-grid">
                <SourcedMetric
                  label="Стоимость года · граждане РФ"
                  field={row.tuition}
                  format={(value) => `${value.toLocaleString("ru-RU")} ₽ / год`}
                />
                {row.duration ? (
                  <SourcedMetric
                    label="Срок очного обучения"
                    field={row.duration}
                  />
                ) : (
                  <p>Срок уточняется</p>
                )}
              </div>
              <h4>Минимальные баллы для участия в конкурсе</h4>
              <div className="requirements-list">
                {row.requirements.map((requirement) => (
                  <ProgramRequirement
                    key={requirement.id}
                    requirement={requirement}
                  />
                ))}
              </div>
              {row.dviMinimum && (
                <SourcedMetric label="Минимум ДВИ" field={row.dviMinimum} />
              )}
              {row.contact && <ProgramContacts contact={row.contact} />}
              <div className="mgu-links">
                <Link
                  href={`/programs/${row.slug}`}
                  className="button button-primary"
                >
                  Карточка программы →
                </Link>
                <a
                  href={`${row.sourceUrl}#page=${row.page}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Источник · страница {row.page} ↗
                </a>
              </div>
            </div>
          </details>
        ))}
      </div>
      {!visible.length && (
        <div className="mgu-empty">
          По этому запросу программ нет. Попробуйте другой факультет или более
          короткое название.
        </div>
      )}
    </section>
  );
}

export function MguScoreArchive({
  records,
}: {
  records: MguPassingScoreRecord[];
}) {
  const [year, setYear] = useState(2025);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const years = [...new Set(records.map((row) => row.year))].sort(
    (a, b) => b - a,
  );
  const found = records.filter(
    (row) =>
      row.year === year &&
      matches(`${row.program} ${row.faculty} ${row.code ?? ""}`, query),
  );
  return (
    <section id="history" className="mgu-section mgu-history">
      <div className="university-section-head">
        <div>
          <span className="overline">Официальный архив · 2011–2025</span>
          <h2>Как менялись проходные баллы</h2>
        </div>
        <a href="https://cpk.msu.ru/legal" target="_blank" rel="noreferrer">
          Архив МГУ ↗
        </a>
      </div>
      <p className="mgu-note">
        Это результаты прошлых кампаний на бюджет, а не гарантия поступления.
        Названия, состав испытаний и шкалы менялись. Сохраняем названия
        соответствующего года; сопоставлять разные шкалы напрямую нельзя. Итоги
        2026 года пока не внесены.
      </p>
      <div className="mgu-controls">
        <label>
          Год поступления
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setLimit(30);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Поиск в архиве
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
            placeholder="Программа или факультет"
          />
        </label>
      </div>
      <p className="mgu-count" role="status">
        Записей за {year}: {found.length}
      </p>
      <div className="mgu-archive-rows">
        {found.slice(0, limit).map((row, index) => (
          <article
            className="mgu-score-row"
            key={`${year}-${index}-${row.program}`}
          >
            <div>
              <small>{row.faculty}</small>
              <h3>{row.program}</h3>
              {row.code && <span>{row.code}</span>}
              {row.firstWaveScore !== null && (
                <p className="mgu-note">
                  Первая волна: {row.firstWaveScore} · Вторая волна:{" "}
                  {row.secondWaveScore ?? "нет значения"}
                </p>
              )}
              {row.program === "МАТЕМАТИКА" && year === 2025 && (
                <p className="mgu-note">
                  В сводке МГУ — 322,{" "}
                  <a
                    href="https://pk.math.msu.ru/abiturientam/speczialitet/prohodnye-bally-proshlyh-let/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    на сайте мехмата — 324 ↗
                  </a>
                  . Есть расхождение источников.
                </p>
              )}
            </div>
            <div className="mgu-score-value">
              <strong>{row.score ?? "—"}</strong>
              <span>
                {row.maxScore ? `шкала ${row.maxScore}` : "шкала не указана"}
              </span>
              {row.score === null && (
                <small>{row.rawScore || "Нет значения в таблице"}</small>
              )}
              <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                Источник {year} ↗
              </a>
            </div>
          </article>
        ))}
      </div>
      {!found.length && (
        <div className="mgu-empty">
          В выбранном году такой записи нет. Измените запрос или год.
        </div>
      )}
      {found.length > limit && (
        <button
          className="button button-secondary"
          onClick={() => setLimit(limit + 30)}
        >
          Показать ещё · осталось {found.length - limit}
        </button>
      )}
      <p className="mgu-note">
        В 2015–2016 годах итоговый ориентир — вторая волна, а при отсутствии её
        значения — первая. В ряде старых строк объединены несколько направлений;
        исходная запись сохранена. В шкале источника балл может превышать число
        баллов за испытания из-за индивидуальных достижений.
      </p>
    </section>
  );
}

export function MguMap() {
  const [loaded, setLoaded] = useState(false);
  const address = encodeURIComponent("Москва, Ленинские горы, 1");
  // Yandex geocoding of the officially sourced street address, checked 2026-09-08.
  // Keep the viewport on the building, not the provider's default regional zoom.
  const mapQuery = `ll=37.530768%2C55.702936&z=16&mode=search&text=${address}`;
  return (
    <section id="map" className="mgu-section mgu-map-section">
      <div>
        <span className="overline">Ленинские горы</span>
        <h2>Кампус на карте</h2>
        <address>119991, Москва, Ленинские горы, д. 1</address>
        <p>
          На карте показано Главное здание. Факультеты и приёмные комиссии
          располагаются в разных корпусах — перед поездкой уточните нужный
          адрес.
        </p>
        <div className="mgu-links">
          <a
            href={`https://yandex.ru/maps/?text=${address}`}
            target="_blank"
            rel="noreferrer"
          >
            Построить маршрут ↗
          </a>
          <a href="https://cpk.msu.ru/pk" target="_blank" rel="noreferrer">
            Адреса всех комиссий ↗
          </a>
          <a
            href="https://pk.math.msu.ru/informacziya/shema-proezda/"
            target="_blank"
            rel="noreferrer"
          >
            Как пройти в Главное здание ↗
          </a>
        </div>
      </div>
      <div className="mgu-map">
        {loaded ? (
          <>
            <iframe
              title="Карта Главного здания МГУ на Ленинских горах"
              src={`https://yandex.ru/map-widget/v1/?${mapQuery}`}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <a
              href={`https://yandex.ru/maps/?text=${address}`}
              target="_blank"
              rel="noreferrer"
            >
              Если карта не загрузилась, открыть Яндекс Карты ↗
            </a>
          </>
        ) : (
          <div className="mgu-map-placeholder">
            <span aria-hidden="true">↗</span>
            <strong>Главное здание МГУ</strong>
            <p>Интерактивная карта от Яндекса</p>
            <button
              className="button button-primary"
              onClick={() => setLoaded(true)}
            >
              Загрузить карту
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
