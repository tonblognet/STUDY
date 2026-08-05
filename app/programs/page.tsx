import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { programs } from "@/lib/data";

export const metadata: Metadata = { title: "Каталог программ", description: "Проверяемые условия поступления в московские вузы: год, статус и официальный источник каждого показателя." };

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return <div className="page-shell container"><div className="page-title"><span className="overline">Официальные источники · 2023–2026</span><h1>Каталог программ</h1><p>Сравнивайте экзамены, проходные баллы, места и стоимость. Неполные данные обозначены явно и не считаются нулевыми.</p></div><CatalogClient items={programs} initialQuery={q}/></div>;
}
