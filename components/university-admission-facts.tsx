"use client";

import { useMemo, useState } from "react";
import {
  groupAdmissionFacts,
  type AdmissionFact,
  type AdmissionFactGroup,
} from "@/lib/admissions/facts";
import styles from "./university-admission-facts.module.css";

const PAGE_SIZE = 12;
const number = new Intl.NumberFormat("ru-RU");

const kindLabel: Record<AdmissionFact["kind"], string> = {
  passing_score: "Проходной балл",
  minimum_to_apply: "Минимум для подачи",
  places: "Места",
  tuition: "Стоимость",
};

function basis(fact: AdmissionFact): string {
  const funding =
    fact.funding === "budget"
      ? "бюджет"
      : fact.funding === "paid"
        ? "договор"
        : "основа не указана";
  return [funding, fact.competition, fact.stage].filter(Boolean).join(" · ");
}

function value(fact: AdmissionFact): string {
  if (fact.unit === "rub")
    return `${number.format(fact.value)} ₽${fact.period === "year" ? " в год" : fact.period === "semester" ? " за семестр" : ""}`;
  return number.format(fact.value);
}

/** Latest budget and paid passing scores of a group, each with its own year. */
function headline(group: AdmissionFactGroup): string {
  const latest = (funding: "budget" | "paid") =>
    group.facts.find(
      (fact) => fact.kind === "passing_score" && fact.funding === funding,
    );
  return [
    ["бюджет", latest("budget")],
    ["договор", latest("paid")],
  ]
    .filter((entry): entry is [string, AdmissionFact] => Boolean(entry[1]))
    .map(
      ([label, fact]) => `${label} ${fact.year}: ${number.format(fact.value)}`,
    )
    .join(" · ");
}

export function UniversityAdmissionFacts({
  facts,
  title = "Результаты приёма, места и стоимость",
  intro,
}: {
  facts: AdmissionFact[];
  title?: string;
  intro?: string;
}) {
  const groups = useMemo(() => groupAdmissionFacts(facts), [facts]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const term = query.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  const filtered = term
    ? groups.filter((group) =>
        `${group.code ?? ""} ${group.label} ${group.form ?? ""}`
          .toLocaleLowerCase("ru")
          .replaceAll("ё", "е")
          .includes(term),
      )
    : groups;
  return (
    <section
      id="admission-results"
      className={styles.section}
      aria-labelledby="admission-results-heading"
    >
      <div className={styles.intro}>
        <div>
          <h2 id="admission-results-heading">
            {title} · {groups.length}
          </h2>
          <p>
            {intro ??
              "Числа, опубликованные вузом: проходные баллы, места и цены. Бюджет и договор показаны раздельно, у каждого значения — год, этап и источник, если вуз их указал. Проходной балл прошлых лет — это исторический результат, а не гарантия поступления; группы с одним кодом не объединяются."}
          </p>
        </div>
        <label className="university-offering-search">
          Поиск по направлениям
          <input
            type="search"
            maxLength={200}
            value={query}
            placeholder="Код или название"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </label>
      </div>
      <p role="status" className={styles.status}>
        Найдено групп: {filtered.length} из {groups.length}
      </p>
      <div className={styles.groups}>
        {filtered.slice(0, limit).map((group) => (
          <details key={group.key} className={styles.group}>
            <summary>
              <span className={styles.title}>
                {group.code && <b>{group.code}</b>} {group.label}
              </span>
              <span className={styles.meta}>
                {[group.form, group.campus].filter(Boolean).join(" · ")}
                {headline(group) && <> · {headline(group)}</>}
              </span>
            </summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Год</th>
                  <th scope="col">Показатель</th>
                  <th scope="col">Основа</th>
                  <th scope="col">Значение</th>
                  <th scope="col">Источник</th>
                </tr>
              </thead>
              <tbody>
                {group.facts.map((fact) => (
                  <tr key={fact.id}>
                    <td>{fact.year}</td>
                    <td>{kindLabel[fact.kind]}</td>
                    <td>{basis(fact)}</td>
                    <td className={styles.value}>{value(fact)}</td>
                    <td>
                      <a
                        href={fact.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        документ ↗
                      </a>
                      {fact.source.section && (
                        <small>{fact.source.section}</small>
                      )}
                      {fact.note && <small>{fact.note}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>
      {filtered.length > limit && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setLimit((current) => current + 24)}
        >
          Показать ещё
        </button>
      )}
    </section>
  );
}
