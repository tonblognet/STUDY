import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { getCatalog } from "@/lib/catalog/server";

export const metadata: Metadata = {
  title: "Программы московских вузов",
  description:
    "Фильтр программ по предметам ЕГЭ, баллам, местам и условиям обучения с официальными источниками.",
};

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { programs, universities } = await getCatalog();
  return (
    <div className="catalog-page container">
      <div className="catalog-title">
        <span className="overline">Приёмная кампания 2026</span>
        <h1>Программы московских вузов</h1>
        <p className="editorial-lead">
          Сравнивайте условия, фильтруйте по ВУЦ и общежитию или сразу проверьте
          свой набор ЕГЭ по официальным требованиям.
        </p>
        <div className="catalog-title-facts" aria-label="О каталоге">
          <span>
            <b>{programs.length}</b> программа
          </span>
          <span>
            <b>2026</b> год данных
          </span>
          <span>
            <b>
              {new Set(programs.map((program) => program.universitySlug)).size}
            </b>{" "}
            вузов первой очереди
          </span>
        </div>
      </div>
      <CatalogClient
        universities={universities}
        items={programs}
        initialQuery={q}
      />
    </div>
  );
}
