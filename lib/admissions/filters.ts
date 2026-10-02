import type { Program } from "@/lib/data";
import type { SourcedValue } from "./types";
import { isCurrentFact } from "./exams";

export type AdmissionFilters = {
  query: string;
  university: string;
  level: string;
  form: string;
  funding: "all" | "budget" | "paid";
  maxPrice: string;
  hostel: boolean;
  military: boolean;
  accreditation: "all" | "verified" | "unknown";
  quality: string;
};
export const DEFAULT_ADMISSION_FILTERS: AdmissionFilters = {
  query: "",
  university: "all",
  level: "all",
  form: "all",
  funding: "all",
  maxPrice: "",
  hostel: false,
  military: false,
  accreditation: "all",
  quality: "all",
};

export function matchesAdmissionFilters(
  program: Program,
  filters: AdmissionFilters,
): boolean {
  const year = program.trust.dataYear;
  const positive = (fact: SourcedValue<number>) =>
    isCurrentFact(fact, year) && fact.value > 0;
  const confirmed = (fact: SourcedValue<boolean> | undefined) =>
    isCurrentFact(fact, year) && fact.value;
  const query = filters.query.trim().toLocaleLowerCase("ru");
  const price = Number(filters.maxPrice);
  return (
    (!query ||
      `${program.title} ${program.code} ${program.tags.join(" ")}`
        .toLocaleLowerCase("ru")
        .includes(query)) &&
    (filters.university === "all" ||
      program.universitySlug === filters.university) &&
    (filters.level === "all" || program.level === filters.level) &&
    (filters.form === "all" || program.form === filters.form) &&
    (filters.funding === "all" ||
      positive(
        filters.funding === "budget"
          ? program.budgetPlacesValue
          : program.paidPlacesValue,
      )) &&
    (filters.maxPrice === "" ||
      (Number.isFinite(price) &&
        price >= 0 &&
        isCurrentFact(program.tuitionValue, year) &&
        program.tuitionValue.value <= price &&
        positive(program.paidPlacesValue))) &&
    (!filters.hostel || confirmed(program.hostel)) &&
    (!filters.military || confirmed(program.militaryCenter)) &&
    (filters.accreditation === "all" ||
      (filters.accreditation === "verified"
        ? confirmed(program.accreditation)
        : !isCurrentFact(program.accreditation, year))) &&
    (filters.quality === "all" || program.trust.status === filters.quality)
  );
}
