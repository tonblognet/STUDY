import type { ExamRequirement } from "@/lib/admissions/types";
import { DataSourceLink } from "./data-status";

export function ProgramRequirement({
  requirement,
}: {
  requirement: ExamRequirement;
}) {
  return (
    <article>
      <div>
        <span>
          {requirement.label}
          {requirement.subjects.length > 1 ? " · один предмет по выбору" : ""}
        </span>
        <h3>{requirement.subjects.join(" / ")}</h3>
      </div>
      {requirement.subjectMinimums ? (
        <div className="subject-minimums">
          {requirement.subjects.map((subject) => {
            const field = requirement.subjectMinimums![subject];
            return (
              <div key={subject}>
                <strong>
                  {subject}: минимум {field?.value ?? "—"}
                </strong>
                {field && <DataSourceLink field={field} compact />}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <strong>минимум {requirement.minimum.value ?? "—"}</strong>
          <DataSourceLink field={requirement.minimum} />
        </>
      )}
    </article>
  );
}
