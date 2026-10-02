"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useUserState } from "@/components/user-state-provider";
import {
  EXAM_SUBJECTS,
  MATCH_LABELS,
  ELIGIBILITY_LABELS,
  DATA_STATUS_LABELS,
} from "@/lib/admissions/constants";
import { groupMatches } from "@/lib/admissions/matching";
import {
  selectScoreSubjects,
  updateScoreInput,
} from "@/lib/admissions/score-input";
import { AdditionalExamInputs } from "./additional-exam-inputs";
import { MatchExplanation } from "./match-explanation";
import { SavedProgramActions } from "./saved-program-actions";
import {
  DEFAULT_ADMISSION_FILTERS,
  matchesAdmissionFilters,
  type AdmissionFilters,
} from "@/lib/admissions/filters";
import { scoreSetSchema } from "@/lib/user-state/validation";
import type { MatchCategory, ScoreSet } from "@/lib/admissions/types";
import type { Program, University } from "@/lib/data";

const categories: Array<{ id: MatchCategory | "all"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "high", label: "Выше ориентира" },
  { id: "competitive", label: "На уровне" },
  { id: "ambitious", label: "Ниже ориентира" },
  { id: "insufficient", label: "Без сравнения" },
];

const makeDraft = (): ScoreSet => ({
  id: "match-draft",
  name: "Основной набор",
  scores: { "Русский язык": 82, Математика: 84, Информатика: 88 },
  individualAchievements: 0,
  updatedAt: new Date().toISOString(),
});

export function EgeMatcherWorkspace({
  programs,
  universities,
}: {
  programs: Program[];
  universities: University[];
}) {
  const { scoreSets, saveScoreSet, removeScoreSet } = useUserState();
  const [profile, setProfile] = useState<ScoreSet>(makeDraft);
  const [selected, setSelected] = useState<string[]>(
    Object.keys(profile.scores),
  );
  const [category, setCategory] = useState<MatchCategory | "all">("all");
  const [filters, setFilters] = useState<AdmissionFilters>(
    DEFAULT_ADMISSION_FILTERS,
  );
  const [eligibility, setEligibility] = useState("all");
  const [saveError, setSaveError] = useState("");
  function filter<K extends keyof AdmissionFilters>(
    key: K,
    value: AdmissionFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const filteredPrograms = useMemo(
    () =>
      programs.filter((program) => matchesAdmissionFilters(program, filters)),
    [programs, filters],
  );

  const matches = useMemo(
    () => groupMatches(filteredPrograms, profile),
    [filteredPrograms, profile],
  );
  const visible = matches.filter(
    ({ match }) =>
      (category === "all" || match.category === category) &&
      (eligibility === "all" || match.eligibility === eligibility),
  );
  const counts = useMemo(
    () =>
      matches.reduce<Record<MatchCategory, number>>(
        (acc, item) => {
          acc[item.match.category] += 1;
          return acc;
        },
        { high: 0, competitive: 0, ambitious: 0, insufficient: 0 },
      ),
    [matches],
  );

  function toggleSubject(subject: string) {
    const next = selected.includes(subject)
      ? selected.filter((item) => item !== subject)
      : [...selected, subject];
    setSelected(next);
    setProfile((item) => ({
      ...item,
      scores: selectScoreSubjects(item.scores, next),
      updatedAt: new Date().toISOString(),
    }));
  }

  function save() {
    const id = profile.id === "match-draft" ? crypto.randomUUID() : profile.id;
    const next = { ...profile, id, updatedAt: new Date().toISOString() };
    const parsed = scoreSetSchema.safeParse({
      ...next,
      name: next.name.trim() || "Мой набор",
    });
    if (!parsed.success) {
      setSaveError(
        "Проверьте название и баллы: нужны целые числа в допустимом диапазоне.",
      );
      return;
    }
    setSaveError("");
    saveScoreSet(parsed.data);
    setProfile(parsed.data);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  }

  function load(item: ScoreSet) {
    setProfile(item);
    setSelected(Object.keys(item.scores));
  }

  return (
    <div className="match-workspace">
      <header className="match-workspace-head">
        <div>
          <span className="overline">Персональный подбор</span>
          <h1>Куда я могу поступить?</h1>
          <p>
            Не скрываем сомнения: показываем запас, дефицит и конкретные данные,
            которых не хватает для честной оценки.
          </p>
        </div>
        <div className="match-head-actions">
          <Link href="/programs" className="button button-secondary">
            Каталог программ
          </Link>
          <button
            className="button button-primary"
            type="button"
            onClick={save}
          >
            {savedNotice ? "Набор сохранён" : "Сохранить набор"}
          </button>
        </div>
      </header>

      {saveError && <p role="alert">{saveError}</p>}
      <div className="match-workspace-grid">
        <aside className="match-profile-rail" aria-label="Профиль ЕГЭ">
          <div className="match-rail-title">
            <span>01</span>
            <div>
              <strong>Ваш профиль</strong>
              <small>Баллы и достижения</small>
            </div>
          </div>
          <label className="match-name-field">
            Название набора
            <input
              maxLength={80}
              value={profile.name}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          {scoreSets.length > 0 && (
            <label className="match-saved-select">
              Сохранённые наборы
              <select
                value={
                  scoreSets.some((item) => item.id === profile.id)
                    ? profile.id
                    : ""
                }
                onChange={(event) => {
                  const item = scoreSets.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (item) load(item);
                }}
              >
                <option value="">Текущий черновик</option>
                {scoreSets.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="match-subject-chips">
            {EXAM_SUBJECTS.map((subject) => (
              <label
                className={selected.includes(subject) ? "selected" : ""}
                key={subject}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(subject)}
                  onChange={() => toggleSubject(subject)}
                />
                {subject}
              </label>
            ))}
          </div>
          <div className="match-score-list">
            {selected.map((subject) => (
              <label key={subject}>
                <span>{subject}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={profile.scores[subject] ?? ""}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      scores: updateScoreInput(
                        current.scores,
                        subject,
                        event.target.value,
                      ),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="match-extra-scores">
            <label>
              Достижения
              <input
                type="number"
                min="0"
                max="10"
                value={profile.individualAchievements}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    individualAchievements: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
          <AdditionalExamInputs
            programs={filteredPrograms}
            profile={profile}
            onChange={setProfile}
          />
          {profile.dviScore !== undefined && (
            <p>
              Старый общий балл ДВИ не переносится между программами. Укажите
              результаты отдельных испытаний.
            </p>
          )}
          {profile.id !== "match-draft" && (
            <button
              className="match-delete-profile"
              type="button"
              onClick={() => {
                removeScoreSet(profile.id);
                const draft = makeDraft();
                setProfile(draft);
                setSelected(Object.keys(draft.scores));
              }}
            >
              Удалить сохранённый набор
            </button>
          )}
        </aside>

        <section className="match-results-column" aria-live="polite">
          <div className="match-results-summary">
            <div>
              <span className="overline">02 · Результат</span>
              <h2>{visible.length} программ</h2>
            </div>
            <p>
              Минимумы испытаний и сравнение с прошлым годом проверяются
              отдельно. Право подачи документов уточняйте в приёмной комиссии.
            </p>
          </div>
          <div
            className="match-category-tabs"
            role="tablist"
            aria-label="Категории результата"
          >
            {categories.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={category === item.id}
                key={item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
                <b>{item.id === "all" ? matches.length : counts[item.id]}</b>
              </button>
            ))}
          </div>
          {visible.length === 0 && (
            <p role="status">
              Нет программ по выбранным условиям. Сбросьте фильтры или измените
              баллы.
            </p>
          )}
          <div className="match-decision-list">
            {visible.map(({ program, match }) => {
              const open = expanded === program.id;
              return (
                <article
                  className={`match-decision-card ${match.category}`}
                  key={program.id}
                >
                  <div className="match-decision-main">
                    <span className="match-category-dot" aria-hidden="true" />
                    <div>
                      <span className="match-decision-category">
                        {ELIGIBILITY_LABELS[match.eligibility]}
                      </span>
                      <h3>
                        <SavedProgramActions id={program.id} />
                        <Link href={`/programs/${program.slug}`}>
                          {program.title}
                        </Link>
                      </h3>
                      <p>
                        {program.universityShort} · {program.code} ·{" "}
                        {program.level}
                      </p>
                    </div>
                    <div className="match-decision-numbers">
                      <span>
                        Ваши <b>{match.consideredScore ?? "—"}</b>
                      </span>
                      <span>
                        Ориентир {program.passingScoreValue.year}{" "}
                        <b>{match.passingScore ?? "—"}</b>
                      </span>
                      <strong>
                        {match.margin === null
                          ? "нет оценки"
                          : `${match.margin > 0 ? "+" : ""}${match.margin}`}
                      </strong>
                    </div>
                  </div>
                  <div className="match-decision-actions">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : program.id)}
                    >
                      {open ? "Скрыть объяснение" : "Почему такой результат"}
                    </button>
                    <Link href={`/programs/${program.slug}`}>
                      Карточка программы →
                    </Link>
                  </div>
                  {open && (
                    <>
                      <MatchExplanation match={match} />
                      <p>
                        {MATCH_LABELS[match.category]} ·{" "}
                        <a
                          href={program.admissionsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Официальные условия приёма
                        </a>
                      </p>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="match-filter-rail" aria-label="Фильтры подбора">
          <div className="match-rail-title">
            <span>03</span>
            <div>
              <strong>Уточнить выбор</strong>
              <small>Фильтры каталога</small>
            </div>
          </div>
          <label>
            Направление или код
            <input
              value={filters.query}
              onChange={(e) => filter("query", e.target.value)}
            />
          </label>
          <label>
            Университет
            <select
              value={filters.university}
              onChange={(e) => filter("university", e.target.value)}
            >
              <option value="all">Все вузы</option>
              {universities.map((item) => (
                <option value={item.slug} key={item.id}>
                  {item.shortName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Уровень
            <select
              value={filters.level}
              onChange={(e) => filter("level", e.target.value)}
            >
              <option value="all">Любой</option>
              <option>Бакалавриат</option>
              <option>Специалитет</option>
            </select>
          </label>
          <label>
            Форма обучения
            <select
              value={filters.form}
              onChange={(e) => filter("form", e.target.value)}
            >
              <option value="all">Любая</option>
              <option>Очная</option>
              <option>Очно-заочная</option>
              <option>Заочная</option>
            </select>
          </label>
          <label>
            Места
            <select
              value={filters.funding}
              onChange={(e) =>
                filter("funding", e.target.value as AdmissionFilters["funding"])
              }
            >
              <option value="all">Бюджет и платно</option>
              <option value="budget">Подтверждённые бюджетные</option>
              <option value="paid">Подтверждённые платные</option>
            </select>
          </label>
          <label>
            Стоимость платного обучения до, ₽/год
            <input
              type="number"
              min="0"
              value={filters.maxPrice}
              onChange={(e) => filter("maxPrice", e.target.value)}
              placeholder="Без ограничения"
            />
          </label>
          <label>
            Проверка испытаний
            <select
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
            >
              <option value="all">Все результаты</option>
              {Object.entries(ELIGIBILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Аккредитация программы
            <select
              value={filters.accreditation}
              onChange={(e) =>
                filter(
                  "accreditation",
                  e.target.value as AdmissionFilters["accreditation"],
                )
              }
            >
              <option value="all">Любой статус</option>
              <option value="verified">Подтверждена</option>
              <option value="unknown">Не проверена</option>
            </select>
          </label>
          <label>
            Качество данных
            <select
              value={filters.quality}
              onChange={(e) => filter("quality", e.target.value)}
            >
              <option value="all">Любое</option>
              {Object.entries(DATA_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="match-toggle-list">
            <label>
              <input
                type="checkbox"
                checked={filters.hostel}
                onChange={(e) => filter("hostel", e.target.checked)}
              />
              Подтверждено общежитие
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.military}
                onChange={(e) => filter("military", e.target.checked)}
              />
              Подтверждён военный учебный центр
            </label>
          </div>
          <p>
            Строгие фильтры исключают неизвестные значения. Наличие общежития не
            гарантирует заселение.
          </p>
          <button
            type="button"
            className="match-reset-filters"
            onClick={() => {
              setFilters(DEFAULT_ADMISSION_FILTERS);
              setEligibility("all");
              setCategory("all");
            }}
          >
            Сбросить фильтры
          </button>
          <div className="match-method-note">
            <strong>Прозрачный расчёт</strong>
            <p>
              Новые программы без проверенных экзаменов и проходного балла не
              получают искусственный прогноз и остаются в группе «Нужно
              уточнить».
            </p>
            <Link href="/methodology">Методика расчёта →</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
