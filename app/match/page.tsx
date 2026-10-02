import type { Metadata } from "next";
import { EgeMatcherWorkspace } from "@/components/ege-matcher-workspace";
import { getCatalog } from "@/lib/catalog/server";
import {
  initialView,
  matchViewSchema,
  type ViewSearch,
} from "@/lib/catalog/view-state";

export const metadata: Metadata = {
  title: "Подбор программ по ЕГЭ",
  description:
    "Подбор программ московских вузов по предметам и баллам ЕГЭ с объяснением результата и официальными источниками.",
};

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<ViewSearch>;
}) {
  const params = await searchParams;
  const { programs, universities } = await getCatalog();
  return (
    <div className="match-page">
      <EgeMatcherWorkspace
        programs={programs}
        universities={universities}
        initialView={initialView(matchViewSchema, params)}
      />
    </div>
  );
}
