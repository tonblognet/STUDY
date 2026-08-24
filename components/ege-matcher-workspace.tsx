"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useUserState } from "@/components/user-state-provider";
import { EXAM_SUBJECTS, MATCH_LABELS } from "@/lib/admissions/constants";
import { groupMatches } from "@/lib/admissions/matching";
import type { MatchCategory, ScoreSet } from "@/lib/admissions/types";
import type { Program, University } from "@/lib/data";

const categories: Array<{ id: MatchCategory | "all"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "high", label: "С запасом" },
  { id: "competitive", label: "Конкурентные" },
  { id: "ambitious", label: "Амбициозные" },
  { id: "insufficient", label: "Нужно уточнить" },
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
  const [university, setUniversity] = useState("all");
  const [level, setLevel] = useState("all");
  const [onlyBudget, setOnlyBudget] = useState(false);
  const [onlyHostel, setOnlyHostel] = useState(false);
  const [onlyMilitary, setOnlyMilitary] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const filteredPrograms = useMemo(
    () =>
      programs.filter(
        (program) =>
          (university === "all" || program.universitySlug === university) &&
          (level === "all" || program.level === level) &&
          (!onlyBudget || (program.budgetPlaces ?? 0) > 0) &&
          (!onlyHostel || program.hostel.value === true) &&
          (!onlyMilitary || program.militaryCenter.value === true),
      ),
    [level, onlyBudget, onlyHostel, onlyMilitary, programs, university],
  );

  const matches = useMemo(
    () => groupMatches(filteredPrograms, profile),
    [filteredPrograms, profile],
  );
  const visible = matches.filter(
    ({ match }) => category === "all" || match.category === category,
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
    setSelected((current) => {
      const next = current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject];
      setProfile((item) => ({
        ...item,
        scores: Object.fromEntries(
          next.map((name) => [name, item.scores[name] ?? 80]),
        ),
        updatedAt: new Date().toISOString(),
      }));
      return next;
    });
  }

  function save() {
    const id = profile.id === "match-draft" ? crypto.randomUUID() : profile.id;
    const next = { ...profile, id, updatedAt: new Date().toISOString() };
    saveScoreSet(next);
    setProfile(next);
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
                  value={profile.scores[subject] ?? 0}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      scores: {
                        ...current.scores,
                        [subject]: Math.max(
                          0,
                          Math.min(100, Number(event.target.value) || 0),
                        ),
                      },
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
                    individualAchievements: Math.max(
                      0,
                      Math.min(10, Number(event.target.value) || 0),
                    ),
                  }))
                }
              />
            </label>
            <label>
              ДВИ
              <input
                type="number"
                min="0"
                max="100"
                value={profile.dviScore ?? ""}
                placeholder="—"
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    dviScore:
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
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
              Оценка опирается на прошлый проходной балл. Это ориентир, а не
              обещание зачисления.
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
                        {MATCH_LABELS[match.category]}
                      </span>
                      <h3>
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
                        Ориентир <b>{match.passingScore ?? "—"}</b>
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
                    <div className="match-explanation">
                      {match.reasons.map((reason) => (
                        <p key={reason}>✓ {reason}</p>
                      ))}
                      {match.missing.map((reason) => (
                        <p className="missing" key={reason}>
                          ! {reason}
                        </p>
                      ))}
                      <p>
                        Полнота данных: {program.trust.completeness}% ·{" "}
                        {program.trust.note}
                      </p>
                    </div>
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
            Университет
            <select
              value={university}
              onChange={(event) => setUniversity(event.target.value)}
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
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="all">Любой</option>
              <option>Бакалавриат</option>
              <option>Специалитет</option>
            </select>
          </label>
          <div className="match-toggle-list">
            <label>
              <input
                type="checkbox"
                checked={onlyBudget}
                onChange={(e) => setOnlyBudget(e.target.checked)}
              />
              Есть бюджетные места
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlyHostel}
                onChange={(e) => setOnlyHostel(e.target.checked)}
              />
              Подтверждено общежитие
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlyMilitary}
                onChange={(e) => setOnlyMilitary(e.target.checked)}
              />
              Есть военный учебный центр
            </label>
          </div>
          <button
            type="button"
            className="match-reset-filters"
            onClick={() => {
              setUniversity("all");
              setLevel("all");
              setOnlyBudget(false);
              setOnlyHostel(false);
              setOnlyMilitary(false);
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
