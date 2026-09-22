import type { Metadata } from "next";
import { EgeMatcherWorkspace } from "@/components/ege-matcher-workspace";
import { getCatalog } from "@/lib/catalog/server";

export const metadata: Metadata = {
  title: "Подбор программ по ЕГЭ",
  description:
    "Подбор программ московских вузов по предметам и баллам ЕГЭ с объяснением результата и официальными источниками.",
};

export default async function MatchPage() {
  const { programs, universities } = await getCatalog();
  return (
    <main className="match-page">
      <EgeMatcherWorkspace programs={programs} universities={universities} />
    </main>
  );
}
