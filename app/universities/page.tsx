import type { Metadata } from "next";
import Link from "next/link";
import { UniversityLogo } from "@/components/university-logo";
import { programs, universities } from "@/lib/data";

export const metadata: Metadata = {
  title: "Вузы Москвы",
  description:
    "Каталог московских университетов и их образовательных программ.",
};
export default function UniversitiesPage() {
  return (
    <div className="page-shell container">
      <div className="page-title">
        <span className="overline">Проверенный каталог</span>
        <h1>Вузы Москвы</h1>
        <p className="editorial-lead">
          Официальные логотипы, программы и ключевые условия поступления — с
          прямыми ссылками на первоисточники.
        </p>
      </div>
      <div className="university-catalog-summary" aria-label="Сводка каталога">
        <span>
          <b>{universities.length}</b> вузов в первой очереди
        </span>
        <span>
          <b>{programs.length}</b> проверяемая программа
        </span>
        <Link href="/programs">Перейти к программам →</Link>
      </div>
      <div className="university-grid">
        {universities.map((u) => {
          const count = programs.filter(
            (program) => program.universitySlug === u.slug,
          ).length;
          return (
            <article
              className="university-card university-card-rich"
              key={u.id}
            >
              <div className="university-card-top">
                <UniversityLogo university={u} />
                <div className="university-card-kicker">
                  <span>{u.shortName}</span>
                  <small>{u.city}</small>
                </div>
                {u.militaryCenter === true && (
                  <span className="university-vuc-badge">Есть ВУЦ</span>
                )}
              </div>
              <div>
                <h2>{u.name}</h2>
                <p>{u.description}</p>
              </div>
              <div className="university-meta">
                <span>
                  {count} {count === 1 ? "программа" : "программ"}
                </span>
                <a href={u.logoSourceUrl} target="_blank" rel="noreferrer">
                  Источник логотипа ↗
                </a>
                <Link href={`/universities/${u.slug}`}>Открыть вуз →</Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
