"use client";

import Link from "next/link";
import type { Program } from "@/lib/data";
import { formatPrice } from "@/lib/data";
import { DataSourceLink, DataStatusBadge } from "@/components/data-status";
import { SavedProgramActions } from "@/components/saved-program-actions";

export function ProgramCard({
  program,
  compact = false,
}: {
  program: Program;
  compact?: boolean;
}) {
  return (
    <article className={`program-card trust-card ${compact ? "compact" : ""}`}>
      <div className="program-card-top">
        <div>
          <span className="university-mark">{program.universityShort}</span>
          <span>{program.code}</span>
        </div>
        <SavedProgramActions id={program.id} compact />
      </div>
      <Link href={`/programs/${program.slug}`} className="program-title-link">
        <h2>{program.title}</h2>
      </Link>
      <p className="program-university">{program.university}</p>
      <div className="program-identity">
        <span>{program.level}</span>
        <span>{program.form}</span>
        <span>{program.duration}</span>
      </div>
      {program.subjects.length > 0 ? (
        <div className="subject-list" aria-label="Вступительные испытания">
          {program.subjects.map((subject) => (
            <span key={subject}>{subject}</span>
          ))}
        </div>
      ) : (
        <p className="missing-copy">Набор испытаний ожидает проверки</p>
      )}
      <div className="program-key-metrics">
        <div>
          <span>Проходной</span>
          <strong>{program.passingScore ?? "—"}</strong>
          <small>{program.passingScoreValue.year}</small>
        </div>
        <div>
          <span>Места</span>
          <strong>
            {program.budgetPlaces ?? "—"} / {program.paidPlaces ?? "—"}
          </strong>
          <small>бюджет / платно</small>
        </div>
        <div>
          <span>Стоимость</span>
          <strong>{formatPrice(program.tuition)}</strong>
          <small>{program.tuitionValue.year}</small>
        </div>
      </div>
      <div className="program-trust-row">
        <DataStatusBadge status={program.trust.status} />
        <span>Полнота {program.trust.completeness}%</span>
      </div>
      <DataSourceLink field={program.passingScoreValue} compact />
      <Link href={`/programs/${program.slug}`} className="program-details-link">
        Проверить условия и источники →
      </Link>
    </article>
  );
}
