import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { programListItem } from "@/lib/catalog/program-list";
import { getCatalog } from "@/lib/catalog/server";
import {
  initialView,
  programViewSchema,
  type ViewSearch,
} from "@/lib/catalog/view-state";

export const metadata: Metadata = {
  title: "Программы московских вузов",
  description:
    "Фильтр программ по предметам ЕГЭ, баллам, местам и условиям обучения с официальными источниками.",
};

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<ViewSearch>;
}) {
  const params = await searchParams;
  const { programs, universities } = await getCatalog();
  const universitySlugs = new Set(
    programs.map((program) => program.universitySlug),
  );
  return (
    <div className="catalog-page container">
      <div className="catalog-title">
        <span className="overline">Приёмная кампания 2026</span>
        <h1>Программы московских вузов</h1>
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
