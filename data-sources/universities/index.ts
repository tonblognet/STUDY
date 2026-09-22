import hse from "./hse/adapter";
import mai from "./mai/adapter";
import mipt from "./mipt/adapter";
import misis from "./misis/adapter";
import mpei from "./mpei/adapter";
import mephi from "./mephi/adapter";
import rudn from "./rudn/adapter";
import ranepa from "./ranepa/adapter";
import msu from "./msu/adapter";
import rea from "./rea/adapter";
import bmstu from "./bmstu/adapter";
import mgimo from "./mgimo/adapter";
import pirogov from "./pirogov/adapter";
import sechenov from "./sechenov/adapter";
import gubkin from "./gubkin/adapter";
import msal from "./msal/adapter";
import muctr from "./muctr/adapter";
import rsuh from "./rsuh/adapter";
import fa from "./fa/adapter";
import mospolytech from "./mospolytech/adapter";
import directory from "../moscow/universities.json";
import { createUniversityAdapter } from "../core/adapter";
import type { University } from "../../lib/data";
import { getDirectoryDetails } from "../../lib/university-directory-details";
import { getAdmissionCampaign } from "../../lib/university-admission-campaigns";

function reviewedProfileDomains(slug: string): string[] {
  const fields = getDirectoryDetails(slug)?.fields ?? {};
  return [
    ...new Set(
      Object.values(fields).map((field) => new URL(field.sourceUrl).hostname),
    ),
  ];
}

const programAdapters = [
  hse,
  mai,
  mipt,
  misis,
  mpei,
  mephi,
  rudn,
  ranepa,
  msu,
  rea,
  bmstu,
  mgimo,
  pirogov,
  sechenov,
  gubkin,
  msal,
  muctr,
  rsuh,
  fa,
  mospolytech,
];
const directoryRecords = directory.universities as University[];
export const universityAdapters = [
  ...programAdapters.map((adapter) => {
    const record = directoryRecords.find(
      (entry) => entry.slug === adapter.slug,
    );
    if (!record?.directory) return adapter;
    return {
      ...adapter,
      officialDomains: [
        ...new Set([
          ...adapter.officialDomains,
          ...reviewedProfileDomains(adapter.slug),
          new URL(record.directory.sourceUrl).hostname,
          new URL(record.directory.websiteSourceUrl).hostname,
          new URL(record.logoSourceUrl).hostname,
        ]),
      ],
    };
  }),
  ...directoryRecords
    .filter(
      (entry) =>
        !programAdapters.some((adapter) => adapter.slug === entry.slug),
    )
    .map((entry) =>
      createUniversityAdapter({
        slug: entry.slug,
        name: entry.shortName,
        markers: [entry.shortName, entry.name],
        officialDomains: [
          ...new Set(
            [
              entry.website,
              entry.logoSourceUrl,
              entry.factsSourceUrl!,
              entry.directory!.sourceUrl,
              entry.directory!.websiteSourceUrl,
              entry.directory!.addressSourceUrl,
            ]
              .map((url) => new URL(url).hostname)
              .concat(reviewedProfileDomains(entry.slug)),
          ),
        ],
        sources: [
          ...Object.entries(
            getAdmissionCampaign(entry.slug)?.sources ?? {},
          ).map(([key, source]) => ({
            category:
              key === "tuition"
                ? ("tuition" as const)
                : key === "budget" || key === "paid"
                  ? ("places" as const)
                  : key === "rules"
                    ? ("rules" as const)
                    : ("exams" as const),
            url: source.url,
            title: source.title,
            year: getAdmissionCampaign(entry.slug)!.year,
            format: source.kind,
          })),
          {
            category: "facts",
            url: entry.directory!.sourceUrl,
            title: "Официальные сведения об организации",
            year: entry.directory!.sourceYear,
            format: entry.directory!.sourceUrl.endsWith(".pdf")
              ? "pdf"
              : "html",
            locator: "Общие сведения",
          },
          {
            category: "facts",
            url: entry.website,
            title: "Официальный сайт",
            year: 2026,
            format: "html",
          },
          ...(entry.logoUrl
            ? [
                {
                  category: "logos" as const,
                  url: entry.logoSourceUrl,
                  title: "Источник символики",
                  year: 2026,
                  format: "html" as const,
                },
              ]
            : []),
        ],
      }),
    ),
];
export const getUniversityAdapter = (slug: string) =>
  universityAdapters.find((adapter) => adapter.slug === slug);
