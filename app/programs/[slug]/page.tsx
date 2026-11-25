import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramDecisionPage } from "@/components/program-decision-page";
import { getCatalog } from "@/lib/catalog/server";
import { UniversityAdmissionFacts } from "@/components/university-admission-facts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { programs } = await getCatalog();
  const { slug } = await params;
  const program = programs.find((item) => item.slug === slug);
  if (!program) return { title: "Программа не найдена" };
  return {
    title: `${program.title} — ${program.universityShort}`,
    description: `Условия поступления, экзамены, места, стоимость и официальные источники по программе «${program.title}».`,
  };
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const catalog = await getCatalog();
  const { slug } = await params;
  const program = catalog.programs.find((item) => item.slug === slug);
  if (!program) notFound();
  // Published results of the same direction code at this university
  // (TASK-2026-11-25, step 4). Groups stay as the university published them.
  const facts = (
    catalog.directoryDetails.find(
      (row) => row.universitySlug === program.universitySlug,
    )?.admissionFacts ?? []
  ).filter((fact) => fact.code?.split(/[\s,/;]+/).includes(program.code));
  return (
    <>
      <ProgramDecisionPage program={program} />
      {facts.length > 0 && (
        <div className="container">
          <UniversityAdmissionFacts
            facts={facts}
            title={`Опубликованные результаты по направлению ${program.code}`}
            intro="Проходные баллы, места и цены, которые вуз опубликовал по этому коду направления: бюджет и договор раздельно, с годом, этапом и источником. Группа в документе вуза может быть шире или уже этой конкурсной программы — проверяйте название группы и форму обучения."
          />
        </div>
      )}
    </>
  );
}
