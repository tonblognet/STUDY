import type { Program } from "@/lib/data";
import Link from "next/link";

export function HomeDataOverview({ programs }: { programs: Program[] }) {
  const average = programs.length
    ? Math.round(
        programs.reduce((sum, program) => sum + program.trust.completeness, 0) /
          programs.length,
      )
    : 0;
  const verified = programs.filter(
    (program) => program.trust.status === "verified",
  ).length;
  const latestCheck = programs
    .map((program) => Date.parse(program.trust.checkedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const checked = latestCheck
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(
        new Date(latestCheck),
      )
    : "нет данных";

  return (
    <section
      className="home-data-overview container"
      aria-labelledby="coverage-title"
    >
      <header>
        <div>
          <span className="overline">Качество текущего набора</span>
          <h2 id="coverage-title">
            Видно не только значение, но и насколько полна карточка
          </h2>
        </div>
        <p>
          Процент считается по опубликованным требованиям, местам, стоимости,
          проходным баллам и служебным метаданным. Неподтверждённые поля не
          увеличивают показатель.
        </p>
      </header>
      <div className="coverage-summary">
        <div>
          <strong>{programs.length}</strong>
          <span>программ в первой проверенной выборке</span>
        </div>
        <div>
          <strong>{verified}</strong>
          <span>карточек со статусом «проверено»</span>
        </div>
        <div>
          <strong>{average}%</strong>
          <span>средняя полнота карточки</span>
        </div>
        <div>
          <strong>{checked}</strong>
          <span>последняя редакторская проверка</span>
        </div>
      </div>
      <figure>
        <figcaption className="sr-only">
          Полнота карточек программ в процентах
        </figcaption>
        <div
          className="coverage-bars"
          role="img"
          aria-label={programs
            .map(
              (program) =>
                `${program.universityShort}: ${program.trust.completeness}%`,
            )
            .join("; ")}
        >
          {programs.map((program) => (
            <div className="coverage-row" key={program.id}>
              <span>{program.universityShort}</span>
              <div>
                <i style={{ width: `${program.trust.completeness}%` }} />
              </div>
              <b>{program.trust.completeness}%</b>
            </div>
          ))}
        </div>
      </figure>
      <Link href="/methodology">
        Как считается полнота и что означает статус →
      </Link>
    </section>
  );
}
