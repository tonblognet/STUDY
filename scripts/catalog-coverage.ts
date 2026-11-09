import { mkdir, writeFile } from "node:fs/promises";
import { universities, programs } from "../lib/data";
import { getDirectoryDetails } from "../lib/university-directory-details";
import { universityCoverageGaps } from "../lib/university-coverage";

// Repository candidate coverage; this never describes an unreviewed DB publication.
const rows = universities.map((university) => {
  const profile = getDirectoryDetails(university.slug);
  const fields = profile?.fields ?? {};
  const related = programs.filter(
    (row) => row.universitySlug === university.slug,
  );
  const missing = universityCoverageGaps(profile, related.length);
  return {
    slug: university.slug,
    name: university.name,
    city: university.city,
    region: university.directory?.region ?? null,
    scope: university.slug.startsWith("russia-") ? "regional" : "existing",
    organizationSourceYear: university.directory?.sourceYear ?? null,
    organizationSourceUrl:
      university.directory?.sourceUrl ?? university.website,
    organizationCheckedAt: university.directory?.checkedAt ?? null,
    officialWebsite: university.website,
    sourcedFields: Object.keys(fields).length,
    faculties: profile?.faculties?.length ?? 0,
    educationalListings: profile?.offerings.length ?? 0,
    historicalEducationAreas: profile?.educationAreas.length ?? 0,
    admissionPrograms: related.length,
    verifiedAdmissionPrograms: related.filter(
      (row) => row.trust.status === "verified",
    ).length,
    currentLicenseStatus: profile?.licenseRegistry.value ?? "not_checked",
    missing,
  };
});
const cities = [...new Set(rows.map((row) => row.city))].sort((a, b) =>
  a.localeCompare(b, "ru"),
);
const output = {
  generatedAt: new Date().toISOString(),
  scope: "repository_candidate",
  note: "Покрытие файлового кандидата. Исторический мониторинг, образовательные перечни и конкурсные программы учитываются отдельно; список факультетов может быть неполным. Отсутствие поля не означает отсутствие условия у вуза. Публикация БД требует отдельного редакционного решения.",
  totals: {
    universities: rows.length,
    cities: cities.length,
    universitiesWithFields: rows.filter((row) => row.sourcedFields > 0).length,
    sourcedFields: rows.reduce((sum, row) => sum + row.sourcedFields, 0),
    universitiesWithFaculties: rows.filter((row) => row.faculties > 0).length,
    faculties: rows.reduce((sum, row) => sum + row.faculties, 0),
    universitiesWithEducationalListings: rows.filter(
      (row) => row.educationalListings > 0,
    ).length,
    educationalListings: rows.reduce(
      (sum, row) => sum + row.educationalListings,
      0,
    ),
    historicalEducationAreas: rows.reduce(
      (sum, row) => sum + row.historicalEducationAreas,
      0,
    ),
    admissionPrograms: programs.length,
    verifiedAdmissionPrograms: programs.filter(
      (row) => row.trust.status === "verified",
    ).length,
    universitiesWithoutFaculties: rows.filter((row) => row.faculties === 0)
      .length,
    universitiesWithoutAdmissionPrograms: rows.filter(
      (row) => row.admissionPrograms === 0,
    ).length,
  },
  cities: cities.map((city) => ({
    city,
    universities: rows.filter((row) => row.city === city).length,
    universitiesWithFaculties: rows.filter(
      (row) => row.city === city && row.faculties > 0,
    ).length,
    admissionPrograms: rows
      .filter((row) => row.city === city)
      .reduce((sum, row) => sum + row.admissionPrograms, 0),
  })),
  nextExistingBatch: rows
    .filter((row) => row.scope === "existing" && row.missing.length > 0)
    .sort(
      (a, b) =>
        b.missing.length - a.missing.length ||
        a.name.localeCompare(b.name, "ru"),
    )
    .slice(0, 30)
    .map(({ slug, name, city, missing, officialWebsite }) => ({
      slug,
      name,
      city,
      missing,
      officialWebsite,
    })),
  universities: rows,
};
await mkdir("data-sources/russia", { recursive: true });
await writeFile(
  "data-sources/russia/coverage.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output.totals));
