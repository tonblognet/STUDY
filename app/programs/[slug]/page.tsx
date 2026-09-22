import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramDecisionPage } from "@/components/program-decision-page";
import { getCatalog } from "@/lib/catalog/server";

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
  const { programs } = await getCatalog();
  const { slug } = await params;
  const program = programs.find((item) => item.slug === slug);
  if (!program) notFound();
  return <ProgramDecisionPage program={program} />;
}
