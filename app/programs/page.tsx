import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { programListItem } from "@/lib/catalog/program-list";
import { getCatalog } from "@/lib/catalog/server";
import { EducationPathwayNavigation } from "@/components/education-pathway-navigation";
import { EducationPathwayExplorer } from "@/components/education-pathway-explorer";
import {
  educationPathwayRows,
  educationTrack,
  educationTracks,
} from "@/lib/education-pathways";
import pathwayStyles from "@/components/education-pathway-navigation.module.css";
import {
  initialView,
  programViewSchema,
  type ViewSearch,
} from "@/lib/catalog/view-state";

export const metadata: Metadata = {
  title: "Программы вузов и колледжей",
  description:
    "Бакалавриат, специалитет, магистратура, аспирантура, докторантура и СПО: программы и условия поступления с официальными источниками.",
};

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<ViewSearch & { track?: string | string[] }>;
}) {
  const params = await searchParams;
  const catalog = await getCatalog();
  const { programs, universities } = catalog;
  const track = educationTrack(params.track);
  if (track !== "undergraduate") {
    const title = educationTracks.find((item) => item.key === track)!.label;
    const rows = educationPathwayRows(catalog, track);
    const context = catalog.directoryDetails
      .find((row) => row.universitySlug === "hse")
      ?.admissionResources?.pathways?.find((item) => item.key === track);
    return (
      <div className="catalog-page container">
        <div className="catalog-title">
          <span className="overline">
            Выберите следующий уровень образования
          </span>
          <h1>{title}</h1>
          <p className="editorial-lead">
            {track === "college"
              ? "Программы среднего профессионального образования из официальных перечней. Отдельные колледжи и подробные условия их приёма добавляются по мере проверки."
              : track === "doctorate"
                ? "Условия подготовки докторских диссертаций и доступные сведения о докторантуре. Приём в аспирантуру вынесен в отдельный раздел."
                : "Программы и научные специальности, вступительные испытания, места и стоимость. Подтверждённые условия отмечены отдельно от общих образовательных перечней."}
          </p>
        </div>
        <EducationPathwayNavigation selected={track} />
        {context && track !== "college" && (
          <section
            className={pathwayStyles.context}
            aria-labelledby="pathway-conditions-title"
          >
            <h2 id="pathway-conditions-title">{context.title}</h2>
            <p>
              <strong>Предыдущее образование:</strong> {context.priorEducation}
            </p>
            <p>
              <strong>Основа поступления:</strong> {context.admissionBasis}
            </p>
            {context.dates.length > 0 && (
              <ul>
                {context.dates.map((date) => (
                  <li key={`${date.year}:${date.label}`}>
                    {date.year}: {date.label}
                  </li>
                ))}
              </ul>
            )}
            {context.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <details>
              <summary>Официальные источники и дата проверки</summary>
              <ul>
                {context.sources.map((source) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>{" "}
                    · проверено {source.checkedAt.slice(0, 10)}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
        <EducationPathwayExplorer key={track} rows={rows} />
      </div>
    );
  }
  const universitySlugs = new Set(
    programs.map((program) => program.universitySlug),
  );
  return (
    <div className="catalog-page container">
      <div className="catalog-title">
        <span className="overline">Приёмная кампания 2026</span>
        <h1>Бакалавриат и специалитет</h1>
        <p className="editorial-lead">
          Сравнивайте условия, фильтруйте по ВУЦ и общежитию или сразу проверьте
          свой набор ЕГЭ по официальным требованиям.
        </p>
        <div
          className="catalog-title-facts"
          role="group"
          aria-label="О каталоге"
        >
          <span>
            Программ: <b>{programs.length}</b>
          </span>
          <span>
            <b>2026</b> год данных
          </span>
          <span>
            <b>{universitySlugs.size}</b> вузов первой очереди
          </span>
        </div>
      </div>
      <EducationPathwayNavigation selected={track} />
      <CatalogClient
        universities={universities
          .filter((university) => universitySlugs.has(university.slug))
          .map(({ id, slug, shortName, color, logoUrl, logoBackground }) => ({
            id,
            slug,
            shortName,
            color,
            logoUrl,
            logoBackground,
          }))}
        items={programs.map(programListItem)}
        initialView={initialView(programViewSchema, params)}
      />
    </div>
  );
}
