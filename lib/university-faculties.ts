import type { DirectoryFaculty } from "./university-directory-details";

export type FacultyListItem = Pick<
  DirectoryFaculty,
  "name" | "url" | "sourceUrl" | "checkedAt"
>;

export function filterUniversityFaculties(
  faculties: FacultyListItem[],
  query: string,
): FacultyListItem[] {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е")
      .replace(/\s+/g, " ");
  const term = normalize(query);
  return faculties.filter((faculty) => normalize(faculty.name).includes(term));
}
