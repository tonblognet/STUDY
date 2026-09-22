import { ComparisonClient } from "@/components/comparison-client";
import { getCatalog } from "@/lib/catalog/server";

export const metadata = { title: "Сравнение программ" };

export default async function ComparePage() {
  const { programs } = await getCatalog();
  return <ComparisonClient programs={programs} />;
}
