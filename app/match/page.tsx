import type { Metadata } from "next";
import { EgeMatcherWorkspace } from "@/components/ege-matcher-workspace";
import { programs, universities } from "@/lib/data";

export const metadata: Metadata = {
  title: "Подбор программ по ЕГЭ",
  description:
    "Подбор программ московских вузов по предметам и баллам ЕГЭ с объяснением результата и официальными источниками.",
};

export default function MatchPage() {
  return (
    <main className="match-page">
      <EgeMatcherWorkspace programs={programs} universities={universities} />
    </main>
  );
}
