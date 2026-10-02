"use client";

import { AdditionalExamInputs } from "./additional-exam-inputs";
import { MatchExplanation } from "./match-explanation";
import { scoreSetSchema } from "@/lib/user-state/validation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  EXAM_SUBJECTS,
  MATCH_LABELS,
  ELIGIBILITY_LABELS,
} from "@/lib/admissions/constants";
import { groupMatches } from "@/lib/admissions/matching";
import {
  selectScoreSubjects,
  updateScoreInput,
} from "@/lib/admissions/score-input";
import { useUserState } from "@/components/user-state-provider";
import type { ScoreSet } from "@/lib/admissions/types";
import type { Program } from "@/lib/data";

const makeInitial = (): ScoreSet => ({
  id: "draft",
  name: "Мой набор",
  scores: { "Русский язык": 80, Математика: 80, Информатика: 80 },
  individualAchievements: 0,
  updatedAt: new Date().toISOString(),
});

export function ExamMatcher({
  programs,
  compact = false,
}: {
  programs: Program[];
  compact?: boolean;
}) {
  const [profile, setProfile] = useState<ScoreSet>(makeInitial);
  const [selected, setSelected] = useState<string[]>([
    "Русский язык",
    "Математика",
    "Информатика",
  ]);
  const { scoreSets: saved, saveScoreSet, removeScoreSet } = useUserState();
  const [saveError, setSaveError] = useState("");
  const [showResults, setShowResults] = useState(false);
  const results = useMemo(
    () => groupMatches(programs, profile),
    [programs, profile],
  );

  function toggleSubject(subject: string) {
    const next = selected.includes(subject)
      ? selected.filter((item) => item !== subject)
      : [...selected, subject];
    setSelected(next);
    setProfile((current) => ({
      ...current,
      scores: selectScoreSubjects(current.scores, next),
    }));
  }

  function setScore(subject: string, value: string) {
    setProfile((current) => ({
      ...current,
      scores: updateScoreInput(current.scores, subject, value),
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveProfile() {
    const item = {
      ...profile,
      id: profile.id === "draft" ? crypto.randomUUID() : profile.id,
      name: profile.name.trim() || `Набор ${saved.length + 1}`,
      updatedAt: new Date().toISOString(),
    };
    const parsed = scoreSetSchema.safeParse(item);
    if (!parsed.success) {
      setSaveError("Проверьте баллы и название набора.");
      return;
    }
    setSaveError("");
    saveScoreSet(parsed.data);
    setProfile(item);
  }

  function loadProfile(item: ScoreSet) {
    setProfile(item);
    setSelected(Object.keys(item.scores));
    setShowResults(true);
  }

  const visibleResults = compact ? results.slice(0, 3) : results;
  return (
    <section
      className={`exam-matcher ${compact ? "compact" : ""}`}
      aria-labelledby="matcher-title"
    >
      <div className="matcher-head">
        <div>
          <span className="overline">Подбор без магического процента</span>
          <h2 id="matcher-title">Введите свои предметы и баллы</h2>
          <p>
            Алгоритм проверяет минимумы, альтернативные предметы, ДВИ и
            сравнивает сумму только с опубликованным итоговым баллом.
          </p>
        </div>
        {saved.length > 0 && (
          <div className="saved-score-picker">
            <label>
              Сохранённые наборы
              <select
                value={profile.id}
                onChange={(event) => {
                  const item = saved.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (item) loadProfile(item);
                }}
              >
                <option value="draft">Новый набор</option>
                {saved.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {profile.id !== "draft" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  removeScoreSet(profile.id);
                  setProfile(makeInitial());
                  setSelected(Object.keys(makeInitial().scores));
                }}
              >
                Удалить набор
              </button>
            )}
          </div>
        )}
      </div>
      <div className="subject-picker" aria-label="Выберите предметы">
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
            <span>{subject}</span>
          </label>
        ))}
      </div>
      <div className="score-inputs">
        {selected.map((subject) => (
          <label key={subject}>
            <span>{subject}</span>
            <input
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              value={profile.scores[subject] ?? ""}
              onChange={(event) => setScore(subject, event.target.value)}
            />
            <small>из 100</small>
          </label>
        ))}
      </div>
      <div className="extra-scores">
        <label>
          Индивидуальные достижения
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
        programs={programs}
        profile={profile}
        onChange={setProfile}
      />
      {saveError && <p role="alert">{saveError}</p>}
      <div className="matcher-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={() => setShowResults(true)}
        >
          Показать подходящие программы
        </button>
        <label>
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
        <button
          type="button"
          className="button outline-button"
          onClick={saveProfile}
        >
          Сохранить набор
        </button>
      </div>
      {showResults && (
        <div className="match-results" aria-live="polite">
          <div className="match-results-head">
            <h3>Результат проверки</h3>
            <p>
              Категория — это прозрачное сравнение с прошлым проходным баллом, а
              не прогноз зачисления.
            </p>
          </div>
          {visibleResults.map(({ program, match }) => (
            <article
              className={`match-result match-${match.category}`}
              key={program.id}
            >
              <div>
                <span className="match-label">
                  {ELIGIBILITY_LABELS[match.eligibility]} ·{" "}
                  {MATCH_LABELS[match.category]}
                </span>
                <h4>
                  <Link href={`/programs/${program.slug}`}>
                    {program.title}
                  </Link>
                </h4>
                <p>
                  {program.universityShort} · {program.code}
                </p>
              </div>
              <div className="match-numbers">
                <span>
                  Ваши баллы <b>{match.consideredScore ?? "—"}</b>
                </span>
                <span>
                  Проходной {program.passingScoreValue.year}{" "}
                  <b>{match.passingScore ?? "—"}</b>
                </span>
                <span>
                  Запас / дефицит{" "}
                  <b>
                    {match.margin === null
                      ? "—"
                      : `${match.margin > 0 ? "+" : ""}${match.margin}`}
                  </b>
                </span>
              </div>
              <details>
                <summary>Почему такой результат</summary>
                <MatchExplanation match={match} />
                <p>Полнота карточки: {program.trust.completeness}%.</p>
              </details>
            </article>
          ))}
          {compact && (
            <Link className="button outline-button" href="/programs">
              Открыть весь каталог
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
