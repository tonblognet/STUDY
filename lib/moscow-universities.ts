import directory from "@/data-sources/moscow/universities.json";
import type { University } from "./data";

export type DirectoryProvenance = {
  monitoringId: string;
  sourceUrl: string;
  sourceYear: number;
  checkedAt: string;
  ownership: "state" | "private";
  kind: "university" | "branch";
  legalName: string;
  authority: string;
  websiteSourceUrl: string;
  addressSourceUrl: string;
  logoAssetSourceUrl?: string;
  logoCheckedAt?: string;
  logoSha256?: string;
  note: string;
};

export function completeMoscowDirectory(existing: University[]): University[] {
  const records = directory.universities as Array<University>;
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  return [
    ...existing.map((university) => {
      const record = bySlug.get(university.slug);
      if (!record) return university;
      const reviewedLocalLogo =
        record.logoUrl?.startsWith("/university-logos/moscow/") &&
        record.directory?.logoSha256;
      return {
        ...record,
        ...university,
        directory:
          !reviewedLocalLogo && university.logoUrl
            ? {
                ...record.directory!,
                logoAssetSourceUrl: undefined,
                logoCheckedAt: undefined,
                logoSha256: undefined,
              }
            : record.directory,
        logoBackground:
          !reviewedLocalLogo && university.logoUrl
            ? university.logoBackground
            : record.logoBackground,
        address: ["mgu", "bmstu", "mgimo", "sechenov"].includes(university.slug)
          ? university.address
          : record.address,
        ...((reviewedLocalLogo || !university.logoUrl) && record.logoUrl
          ? { logoUrl: record.logoUrl, logoSourceUrl: record.logoSourceUrl }
          : {}),
      };
    }),
    ...records.filter(
      (record) =>
        !existing.some((university) => university.slug === record.slug),
    ),
  ];
}

export function universityTypeLabel(university: University): string {
  if (!university.directory) return "Университет";
  const owner =
    university.directory.ownership === "private"
      ? "Негосударственный"
      : "Государственный";
  return `${owner} ${university.directory.kind === "branch" ? "филиал" : "вуз"}`;
}
