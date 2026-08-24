import { ComparisonClient } from "@/components/comparison-client";
import { programs } from "@/lib/data";

export const metadata = { title: "Сравнение программ" };

export default function ComparePage() {
  return <ComparisonClient programs={programs} />;
}
