"use client";

import { AdditionalExamInputs } from "./additional-exam-inputs";
import Link from "next/link";
import { useModalFocus } from "./use-modal-focus";
import { useRef, useMemo, useState } from "react";
import { EXAM_SUBJECTS, MATCH_LABELS } from "@/lib/admissions/constants";
import { groupMatches } from "@/lib/admissions/matching";
import { updateScoreInput } from "@/lib/admissions/score-input";
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
  const [additionalExamScores, setAdditionalExamScores] = useState<
    Record<string, number>
  >({});
  const [showResults, setShowResults] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  useModalFocus(panelRef, true, onClose);

  const profile = useMemo<ScoreSet>(
    () => ({
      id: "catalog-draft",
      name: "Баллы из каталога",
      scores: Object.fromEntries(
        Object.entries(scores).filter(([subject]) =>
          selected.includes(subject),
        ),
      ),
      individualAchievements: achievements,
      additionalExamScores,
      updatedAt: new Date().toISOString(),
    }),
    [achievements, additionalExamScores, scores, selected],
  );
  const results = useMemo(
    () => groupMatches(programs, profile),
    [profile, programs],
  );
  const eligible = results.filter(
    ({ match }) => match.eligibility === "eligible",
  );

  function toggleSubject(subject: string) {
    setSelected((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject],
    );
    setShowResults(false);
  }

  const scoreLabel = selected
    .map((subject) => `${subject} ${scores[subject] ?? "не введён"}`)
    .join(" · ");

  return (
    <>
      <button
        type="button"
        className="ege-drawer-backdrop"
        tabIndex={-1}
        aria-label="Закрыть подбор по ЕГЭ"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
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
                      value={scores[subject] ?? ""}
                      onChange={(event) => {
                        setScores((current) =>
                          updateScoreInput(
                            current,
                            subject,
                            event.target.value,
                          ),
                        );
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
                  setAchievements(Number(event.target.value));
                  setShowResults(false);
                }}
              />
            </label>
          </div>
          <AdditionalExamInputs
            programs={programs}
            profile={profile}
            onChange={(next) => {
              setAdditionalExamScores(next.additionalExamScores ?? {});
              setShowResults(false);
            }}
          />

          {!showResults ? (
            <button
              type="button"
              className="button button-primary ege-check-button"
              disabled={selected.length === 0}
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
                  программ проходят проверку минимумов испытаний. Историческое
                  сравнение доступно только при проверенной шкале. Все причины и
                  остальные программы доступны в полном подборе.
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
                      {program.universityShort} · ваши{" "}
                      {match.consideredScore ?? "—"} · ориентир{" "}
                      {match.passingScore ?? "—"}
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
