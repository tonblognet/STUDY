"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CatalogEgeDrawer } from "@/components/catalog-ege-drawer";
import { UniversityLogo } from "@/components/university-logo";
import { useUserState } from "@/components/user-state-provider";
import type { DataStatus } from "@/lib/admissions/types";
import type { Program, University } from "@/lib/data";
import { formatPrice } from "@/lib/catalog/format";

type Sort = "quality" | "score" | "price" | "places";
const MAX_CATALOG_PRICE = 1_200_000;

export function CatalogClient({
  items,
  universities,
  initialQuery = "",
}: {
  items: Program[];
  universities: University[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [onlyBudget, setOnlyBudget] = useState(false);
  const [maxScore, setMaxScore] = useState(300);
  const [maxPrice, setMaxPrice] = useState(MAX_CATALOG_PRICE);
  const [form, setForm] = useState("Любая");
  const [hostel, setHostel] = useState("Любое");
  const [militaryCenter, setMilitaryCenter] = useState("Любое");
  const [university, setUniversity] = useState("Все вузы");
  const [level, setLevel] = useState("Любой");
  const [dataStatus, setDataStatus] = useState("Любой");
  const [sort, setSort] = useState<Sort>("quality");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [matcherOpen, setMatcherOpen] = useState(false);
  const [matchedIds, setMatchedIds] = useState<string[] | null>(null);
  const [matchLabel, setMatchLabel] = useState("");
  const { favoriteIds, comparisonIds, toggleFavorite, toggleComparison } =
    useUserState();

  const subjectOptions = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) =>
            item.examRequirements
              .flatMap((requirement) => requirement.subjects)
              .concat(
                item.subjects.map(
                  (subject) => subject.split(" /")[0] ?? subject,
                ),
              ),
          ),
        ),
      ]
        .filter(Boolean)
        .sort(),
    [items],
  );
  const universityOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.universitySlug))]
        .map((slug) =>
          universities.find((university) => university.slug === slug),
        )
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => a.shortName.localeCompare(b.shortName, "ru")),
    [items, universities],
  );
  const activeCount =
    subjects.length +
    Number(onlyBudget) +
    Number(maxScore < 300) +
    Number(maxPrice < MAX_CATALOG_PRICE) +
    Number(form !== "Любая") +
    Number(hostel !== "Любое") +
    Number(militaryCenter !== "Любое") +
    Number(university !== "Все вузы") +
    Number(level !== "Любой") +
    Number(dataStatus !== "Любой") +
    Number(matchedIds !== null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return items
      .filter((item) => {
        const itemSubjects = item.examRequirements
          .flatMap((requirement) => requirement.subjects)
          .concat(item.subjects);
        return (
          (!needle ||
            `${item.title} ${item.code} ${item.university} ${item.universityShort}`
              .toLocaleLowerCase("ru")
              .includes(needle)) &&
          subjects.every((subject) =>
            itemSubjects.some((value) => value.includes(subject)),
          ) &&
          (!onlyBudget || (item.budgetPlaces ?? 0) > 0) &&
          (item.passingScore === null || item.passingScore <= maxScore) &&
          (item.tuition === null || item.tuition <= maxPrice) &&
          (form === "Любая" || item.form === form) &&
          (university === "Все вузы" || item.universitySlug === university) &&
          (level === "Любой" || item.level === level) &&
          (dataStatus === "Любой" || item.trust.status === dataStatus) &&
          (hostel === "Любое" ||
            (hostel === "Есть"
              ? item.hostel.value === true
              : item.hostel.value === false)) &&
          (militaryCenter === "Любое" ||
            (militaryCenter === "Есть"
              ? item.militaryCenter.value === true
              : item.militaryCenter.value === false)) &&
          (matchedIds === null || matchedIds.includes(item.id))
        );
      })
      .sort((a, b) => {
        if (sort === "score")
          return (a.passingScore ?? 999) - (b.passingScore ?? 999);
        if (sort === "price")
          return (
            (a.tuition ?? Number.MAX_SAFE_INTEGER) -
            (b.tuition ?? Number.MAX_SAFE_INTEGER)
          );
        if (sort === "places")
          return (b.budgetPlaces ?? -1) - (a.budgetPlaces ?? -1);
        return b.trust.completeness - a.trust.completeness;
      });
  }, [
    form,
    hostel,
    militaryCenter,
    university,
    level,
    dataStatus,
    matchedIds,
    items,
    maxPrice,
    maxScore,
    onlyBudget,
    query,
    sort,
    subjects,
  ]);

  function toggleSubject(subject: string) {
    setSubjects((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject],
    );
  }

  function reset() {
    setSubjects([]);
    setOnlyBudget(false);
    setMaxScore(300);
    setMaxPrice(MAX_CATALOG_PRICE);
    setForm("Любая");
    setHostel("Любое");
    setMilitaryCenter("Любое");
    setUniversity("Все вузы");
    setLevel("Любой");
    setDataStatus("Любой");
    setMatchedIds(null);
    setMatchLabel("");
  }

  const compared = comparisonIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is Program => Boolean(item));

  return (
    <>
      <div className="catalog-command-bar">
        <label className="catalog-search">
          <span className="sr-only">Поиск программ</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название программы, направление или вуз"
          />
        </label>
        <button
          type="button"
          className="button ege-launch-button"
          onClick={() => setMatcherOpen(true)}
        >
          <SparkIcon />
          Подобрать по ЕГЭ
        </button>
      </div>
      <button
        className="mobile-filter-button"
        type="button"
        onClick={() => setFiltersOpen(true)}
      >
        <FilterIcon />
        Фильтры{activeCount > 0 && <b>{activeCount}</b>}
      </button>
      <div className="catalog-shell">
        <aside
          className={filtersOpen ? "filter-rail open" : "filter-rail"}
          aria-label="Фильтры программ"
        >
          <div className="filter-mobile-head">
            <strong>Фильтры</strong>
            <button
              onClick={() => setFiltersOpen(false)}
              aria-label="Закрыть фильтры"
            >
              ×
            </button>
          </div>
          <FilterGroup title="Предметы ЕГЭ">
            <div className="check-list">
              {subjectOptions.slice(0, 7).map((subject) => (
                <label key={subject}>
                  <input
                    type="checkbox"
                    checked={subjects.includes(subject)}
                    onChange={() => toggleSubject(subject)}
                  />
                  <span>{subject}</span>
                </label>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Вуз">
            <select
              value={university}
              onChange={(event) => setUniversity(event.target.value)}
            >
              <option>Все вузы</option>
              {universityOptions.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.shortName}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup title="Уровень образования">
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option>Любой</option>
              <option>Бакалавриат</option>
              <option>Специалитет</option>
            </select>
          </FilterGroup>
          <FilterGroup title="Бюджетные места">
            <label className="filter-check">
              <input
                type="checkbox"
                checked={onlyBudget}
                onChange={(event) => setOnlyBudget(event.target.checked)}
              />
              <span>Только с бюджетными местами</span>
            </label>
          </FilterGroup>
          <FilterGroup title="Проходной балл">
            <label className="range-control">
              <span>до {maxScore}</span>
              <input
                type="range"
                min="150"
                max="300"
                step="5"
                value={maxScore}
                onChange={(event) => setMaxScore(Number(event.target.value))}
              />
            </label>
          </FilterGroup>
          <FilterGroup title="Стоимость">
            <label className="range-control">
              <span>
                до {new Intl.NumberFormat("ru-RU").format(maxPrice)} ₽
              </span>
              <input
                type="range"
                min="100000"
                max={MAX_CATALOG_PRICE}
                step="25000"
                value={maxPrice}
                onChange={(event) => setMaxPrice(Number(event.target.value))}
              />
            </label>
          </FilterGroup>
          <FilterGroup title="Форма обучения">
            <select
              value={form}
              onChange={(event) => setForm(event.target.value)}
            >
              <option>Любая</option>
              <option>Очная</option>
              <option>Очно-заочная</option>
              <option>Заочная</option>
            </select>
          </FilterGroup>
          <FilterGroup title="Общежитие">
            <select
              value={hostel}
              onChange={(event) => setHostel(event.target.value)}
            >
              <option>Любое</option>
              <option>Есть</option>
              <option>Нет</option>
            </select>
          </FilterGroup>
          <FilterGroup title="Военный учебный центр">
            <select
              value={militaryCenter}
              onChange={(event) => setMilitaryCenter(event.target.value)}
            >
              <option>Любое</option>
              <option>Есть</option>
              <option>Нет</option>
            </select>
            <small className="filter-hint">
              Наличие ВУЦ не означает автоматический допуск: действует отдельный
              конкурс.
            </small>
          </FilterGroup>
          <FilterGroup title="Статус данных">
            <select
              value={dataStatus}
              onChange={(event) =>
                setDataStatus(event.target.value as DataStatus | "Любой")
              }
            >
              <option>Любой</option>
              <option value="verified">Проверено</option>
              <option value="pending_review">Ожидает проверки</option>
              <option value="not_published">Не опубликовано</option>
            </select>
          </FilterGroup>
          <button type="button" className="reset-filters" onClick={reset}>
            Сбросить все фильтры
          </button>
          <button
            type="button"
            className="button button-primary apply-filters"
            onClick={() => setFiltersOpen(false)}
          >
            Показать {filtered.length}
          </button>
        </aside>

        <section className="program-results" aria-live="polite">
          <div className="results-toolbar">
            <strong>
              Найдено {filtered.length} {pluralize(filtered.length)}
            </strong>
            <label>
              <span className="sr-only">Сортировка</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
              >
                <option value="quality">По соответствию</option>
                <option value="score">Сначала ниже балл</option>
                <option value="price">Сначала дешевле</option>
                <option value="places">Больше бюджетных мест</option>
              </select>
            </label>
          </div>
          {(subjects.length > 0 || matchedIds !== null) && (
            <div className="active-filters">
              {subjects.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={() => toggleSubject(subject)}
                >
                  {subject}
                  <span>×</span>
                </button>
              ))}
              {matchedIds !== null && (
                <button
                  type="button"
                  className="ege-active-filter"
                  onClick={() => {
                    setMatchedIds(null);
                    setMatchLabel("");
                  }}
                  title={matchLabel}
                >
                  Подбор по ЕГЭ · {matchedIds.length}
                  <span>×</span>
                </button>
              )}
            </div>
          )}
          <div className="program-list-head">
            <span>Программа / вуз</span>
            <span>Предметы ЕГЭ</span>
            <span>Бюджетные места</span>
            <span>Проходной балл</span>
            <span>Стоимость</span>
            <span className="sr-only">Действия</span>
          </div>
          {filtered.length ? (
            <div className="program-list">
              {filtered.map((program) => {
                const isFavorite = favoriteIds.includes(program.id);
                const inComparison = comparisonIds.includes(program.id);
                const itemSubjects = program.examRequirements
                  .flatMap((requirement) => requirement.subjects)
                  .concat(program.subjects)
                  .slice(0, 3);
                return (
                  <article
                    className={
                      inComparison ? "program-row selected" : "program-row"
                    }
                    key={program.id}
                  >
                    <label className="compare-check">
                      <input
                        type="checkbox"
                        checked={inComparison}
                        onChange={() => toggleComparison(program.id)}
                      />
                      <span className="sr-only">
                        Добавить {program.title} в сравнение
                      </span>
                    </label>
                    <Link
                      className="program-name"
                      href={`/programs/${program.slug}`}
                    >
                      {universities.find(
                        (item) => item.slug === program.universitySlug,
                      ) && (
                        <UniversityLogo
                          university={
                            universities.find(
                              (item) => item.slug === program.universitySlug,
                            )!
                          }
                          size="row"
                        />
                      )}
                      <span className="program-name-copy">
                        <strong>{program.title}</strong>
                        <span>
                          {program.universityShort} · {program.code}
                        </span>
                        <small>
                          {program.level}, {program.form}
                          {program.militaryCenter.value === true
                            ? " · ВУЦ"
                            : ""}
                        </small>
                      </span>
                    </Link>
                    <div className="program-subjects">
                      {itemSubjects.length ? (
                        itemSubjects.map((subject) => (
                          <span key={subject}>{subject}</span>
                        ))
                      ) : (
                        <em>На проверке</em>
                      )}
                    </div>
                    <ProgramMetric
                      value={program.budgetPlaces}
                      suffix=" мест"
                      year={program.budgetPlacesValue.year}
                    />
                    <ProgramMetric
                      value={program.passingScore}
                      suffix=""
                      year={program.passingScoreValue.year}
                    />
                    <div className="program-metric">
                      <b>{formatPrice(program.tuition)}</b>
                      <small>{program.tuitionValue.year}</small>
                    </div>
                    <button
                      type="button"
                      className={
                        isFavorite ? "row-favorite active" : "row-favorite"
                      }
                      onClick={() => toggleFavorite(program.id)}
                      aria-pressed={isFavorite}
                      aria-label={
                        isFavorite
                          ? "Удалить из избранного"
                          : "Сохранить программу"
                      }
                    >
                      <HeartIcon filled={isFavorite} />
                    </button>
                    <Link
                      className="row-arrow"
                      href={`/programs/${program.slug}`}
                      aria-label={`Открыть ${program.title}`}
                    >
                      <ArrowIcon />
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Подходящих программ не найдено</strong>
              <p>
                Ослабьте фильтры. Неизвестные значения мы не считаем подходящими
                автоматически.
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={reset}
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </section>
      </div>

      {compared.length > 0 && (
        <div className="compare-dock">
          <div>
            <span>
              В сравнении <b>{compared.length}</b>
            </span>
            {compared.slice(0, 2).map((program) => (
              <div className="dock-item" key={program.id}>
                <strong>{program.title}</strong>
                <small>{program.universityShort}</small>
                <button
                  type="button"
                  onClick={() => toggleComparison(program.id)}
                  aria-label={`Убрать ${program.title}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <Link href="/compare" className="button button-primary">
            Сравнить выбранные
          </Link>
        </div>
      )}
      {filtersOpen && (
        <button
          className="filter-backdrop"
          aria-label="Закрыть фильтры"
          onClick={() => setFiltersOpen(false)}
        />
      )}
      {matcherOpen && (
        <CatalogEgeDrawer
          programs={items}
          onClose={() => setMatcherOpen(false)}
          onApply={(ids, label) => {
            setMatchedIds(ids);
            setMatchLabel(label);
            setMatcherOpen(false);
          }}
        />
      )}
    </>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function ProgramMetric({
  value,
  suffix,
  year,
}: {
  value: number | null;
  suffix: string;
  year: number;
}) {
  return (
    <div className="program-metric">
      <b>{value === null ? "—" : `${value}${suffix}`}</b>
      <small>{value === null ? "не опубликовано" : year}</small>
    </div>
  );
}

function pluralize(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return "программа";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return "программы";
  return "программ";
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
    </svg>
  );
}
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={filled ? "filled" : ""}
    >
      <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2Z" />
      <path d="m18.5 15 .7 2.3 2.3.7-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.7.8-2.3Z" />
    </svg>
  );
}
