import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramDecisionPage } from "@/components/program-decision-page";
import { getProgram, programs } from "@/lib/data";

export function generateStaticParams() { return programs.map((program) => ({ slug: program.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const program = getProgram((await params).slug);
  if (!program) return { title: "Программа не найдена" };
  return { title: `${program.title} — ${program.universityShort}`, description: `Условия поступления, экзамены, места, стоимость и официальные источники по программе «${program.title}».` };
}

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const program = getProgram((await params).slug);
  if (!program) notFound();
  return <ProgramDecisionPage program={program}/>;
}
