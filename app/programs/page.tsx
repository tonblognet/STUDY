import type { Metadata } from "next";
import { CatalogClient } from "@/components/catalog-client";
import { programs } from "@/lib/data";

export const metadata: Metadata = { title: "Каталог программ", description: "Поиск направлений подготовки в московских вузах по баллам, предметам, местам и стоимости." };

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return <div className="page-shell container"><div className="page-title"><span className="overline">Москва · 2026</span><h1>Каталог программ</h1><p>Сравните требования и выберите направления, которые подходят именно вам.</p></div><CatalogClient items={programs} initialQuery={q}/></div>;
}
