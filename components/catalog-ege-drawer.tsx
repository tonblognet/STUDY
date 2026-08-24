"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EXAM_SUBJECTS, MATCH_LABELS } from "@/lib/admissions/constants";
import { groupMatches } from "@/lib/admissions/matching";
import type { ScoreSet } from "@/lib/admissions/types";
import type { Program } from "@/lib/data";

type Props = {
  programs: Program[];
  onApply: (programIds: string[], label: string) => void;
  onClose: () => void;
};

const initialScores: Record<string, number> = {
  "Русский язык": 80,
  Математика: 80,
  Информатика: 80,
};

export function CatalogEgeDrawer({ programs, onApply, onClose }: Props) {
  const [selected, setSelected] = useState(Object.keys(initialScores));
  const [scores, setScores] = useState(initialScores);
  const [achievements, setAchievements] = useState(0);
  const [dviScore, setDviScore] = useState<number | undefined>();
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("drawer-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("drawer-open");
    };
  }, [onClose]);

  const profile = useMemo<ScoreSet>(
    () => ({
      id: "catalog-draft",
      name: "Баллы из каталога",
      scores: Object.fromEntries(
        selected.map((subject) => [subject, scores[subject] ?? 0]),
      ),
      individualAchievements: achievements,
      dviScore,
      updatedAt: new Date().toISOString(),
    }),
    [achievements, dviScore, scores, selected],
  );
  const results = useMemo(
    () => groupMatches(programs, profile),
    [profile, programs],
  );
  const eligible = results.filter(
    ({ match }) => match.category !== "insufficient",
  );

  function toggleSubject(subject: string) {
    setSelected((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject],
    );
    setScores((current) => ({ ...current, [subject]: current[subject] ?? 80 }));
    setShowResults(false);
  }

  const scoreLabel = selected
    .map((subject) => `${subject} ${scores[subject] ?? 0}`)
    .join(" · ");

  return (
    <>
      <button
        type="button"
        className="ege-drawer-backdrop"
        aria-label="Закрыть подбор по ЕГЭ"
        onClick={onClose}
      />
      <section
        className="ege-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-matcher-title"
      >
        <header className="ege-drawer-head">
          <div>
            <span className="overline">Персональный подбор</span>
            <h2 id="catalog-matcher-title">Куда поступать с моими баллами?</h2>
            <p>
              Проверим минимумы, альтернативные предметы и сравним сумму с
              опубликованным проходным баллом.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="ege-drawer-content">
          <fieldset className="ege-subject-selector">
            <legend>1. Выберите предметы ЕГЭ</legend>
            <div>
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
          </fieldset>

          <fieldset className="ege-score-grid">
            <legend>2. Введите баллы</legend>
            <div>
              {selected.map((subject) => (
                <label key={subject}>
                  <span>{subject}</span>
                  <span className="ege-score-input">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      inputMode="numeric"
                      value={scores[subject] ?? 0}
                      onChange={(event) => {
                        setScores((current) => ({
                          ...current,
                          [subject]: Math.max(
                            0,
                            Math.min(100, Number(event.target.value) || 0),
                          ),
                        }));
                        setShowResults(false);
                      }}
                    />
                    <small>/ 100</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="ege-extra-grid">
            <label>
              Индивидуальные достижения
              <input
                type="number"
                min="0"
                max="10"
                value={achievements}
                onChange={(event) => {
                  setAchievements(
                    Math.max(0, Math.min(10, Number(event.target.value) || 0)),
                  );
                  setShowResults(false);
                }}
              />
            </label>
            <label>
              ДВИ, если уже известен
              <input
                type="number"
                min="0"
                max="100"
                value={dviScore ?? ""}
                placeholder="Не введён"
                onChange={(event) => {
                  setDviScore(
                    event.target.value === ""
                      ? undefined
                      : Math.max(0, Math.min(100, Number(event.target.value))),
                  );
                  setShowResults(false);
                }}
              />
            </label>
          </div>

          {!showResults ? (
            <button
              type="button"
              className="button button-primary ege-check-button"
              disabled={selected.length < 3}
              onClick={() => setShowResults(true)}
            >
              Проверить {programs.length} программ
            </button>
          ) : (
            <div className="ege-drawer-results" aria-live="polite">
              <div className="ege-results-summary">
                <span>Подбор завершён</span>
                <strong>{eligible.length}</strong>
                <p>
                  программ можно оценить по опубликованным данным. Остальные не
                  скрыты навсегда — им не хватает предмета или проверенного
                  проходного балла.
                </p>
              </div>
              <div className="ege-result-list">
                {eligible.slice(0, 5).map(({ program, match }) => (
                  <article key={program.id}>
                    <span className={`match-pill ${match.category}`}>
                      {MATCH_LABELS[match.category]}
                    </span>
                    <Link href={`/programs/${program.slug}`}>
                      {program.title}
                    </Link>
                    <small>
                      {program.universityShort} · ваши {match.consideredScore} ·
                      ориентир {match.passingScore}
                    </small>
                  </article>
                ))}
              </div>
              <button
                type="button"
                className="button button-primary"
                onClick={() =>
                  onApply(
                    eligible.map(({ program }) => program.id),
                    scoreLabel,
                  )
                }
              >
                Показать их в каталоге
              </button>
              <Link href="/match" className="button outline-button">
                Открыть полный подбор
              </Link>
              <p className="ege-disclaimer">
                Это ориентир по прошлому проходному баллу, а не гарантия
                зачисления. Конкурс меняется каждый год.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
