"use client";

import Link from "next/link";
import type { Program } from "@/lib/data";
import type { ScoreSet } from "@/lib/admissions/types";
import { additionalExamKey, getAdditionalExams } from "@/lib/admissions/exams";

export function AdditionalExamInputs({
  programs,
  profile,
  onChange,
}: {
  programs: Program[];
  profile: ScoreSet;
  onChange: (profile: ScoreSet) => void;
}) {
  const exams = programs.flatMap((program) =>
    getAdditionalExams(program).map((exam) => ({ program, exam })),
  );
  if (!exams.length) return null;
  return (
    <details className="additional-exam-inputs">
      <summary>Дополнительные испытания ({exams.length})</summary>
      <p>
        Укажите результат для конкретной программы. Общий балл ДВИ из старого
        набора нужно ввести заново.
      </p>
      {exams.map(({ program, exam }) => {
        const key = additionalExamKey(program, exam);
        return (
          <label key={key}>
            <span>
              {program.universityShort} · {program.title} ·{" "}
              {program.faculty ? `${program.faculty} · ` : ""}
              {program.code} · {program.form} · {exam.title.value ?? "ДВИ"}
            </span>
            <input
              type="number"
              min="0"
              max={
                exam.maximum.status === "verified"
                  ? (exam.maximum.value ?? 100)
                  : 100
              }
              step="1"
              value={profile.additionalExamScores?.[key] ?? ""}
              placeholder="Не введён"
              onChange={(event) => {
                const next = { ...profile.additionalExamScores };
                if (event.target.value === "") delete next[key];
                else next[key] = Number(event.target.value);
                onChange({ ...profile, additionalExamScores: next });
              }}
            />
            <Link href={`/programs/${program.slug}`}>Карточка программы →</Link>
            <a href={exam.minimum.sourceUrl} target="_blank" rel="noreferrer">
              Источник минимума · {exam.minimum.year}
            </a>
          </label>
        );
      })}
    </details>
  );
}
