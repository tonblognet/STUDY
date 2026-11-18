import { describe, expect, it } from "vitest";
import { baselineCatalog } from "@/lib/catalog/baseline";
import {
  educationPathwayRows,
  educationTrack,
  offeringTrack,
} from "./education-pathways";
import { filterHseExplorerRows } from "./hse-explorer-data";

describe("education pathways from the selected catalog publication", () => {
  it("accepts the five explicit routes and resets untrusted query values", () => {
    expect(educationTrack("master")).toBe("master");
    expect(educationTrack("college")).toBe("college");
    expect(educationTrack(["master"])).toBe("undergraduate");
    expect(educationTrack("constructor")).toBe("undergraduate");
  });

  it("distinguishes academic degrees from professional-development names", () => {
    expect(offeringTrack("Высшее образование — магистратура")).toBe("master");
    expect(offeringTrack("Магистр")).toBe("master");
    expect(offeringTrack("Квалификация: Магистр")).toBe("master");
    expect(offeringTrack("Аспирантура")).toBe("aspirantura");
    expect(
      offeringTrack(
        "Высшее образование — подготовка научно-педагогических кадров высшей квалификации",
      ),
    ).toBe("aspirantura");
    expect(offeringTrack("Докторантура")).toBe("doctorate");
    expect(offeringTrack("Среднее профессиональное образование")).toBe(
      "college",
    );
    expect(offeringTrack("  СПО  ")).toBe("college");
    for (const level of [
      "Executive Master in",
      "Specialized Master",
      "Doctor in/of",
      "MBA",
      "Профессиональная переподготовка",
      "Повышение квалификации (магистратура)",
    ])
      expect(offeringTrack(level)).toBeNull();
  });

  it("does not turn an ambiguous statutory level into a master's program", () => {
    for (const level of [
      "Высшее образование — специалитет, магистратура",
      "Бакалавриат / магистратура",
      "Магистратура и аспирантура",
      "Докторантура и аспирантура",
      "Бакалавр, магистр",
    ])
      expect(offeringTrack(level)).toBeNull();
    expect(
      offeringTrack(
        "Высшее образование — специалитет, магистратура; квалификация: Магистр",
      ),
    ).toBe("master");
  });

  it("keeps a generic program's unknown campus unknown even when the institution's city is known", () => {
    const catalog = baselineCatalog();
    const rows = educationPathwayRows(catalog, "master");
    const withoutCampus = rows.find(
      (row) => row.universitySlug !== "hse" && !row.offering?.campus,
    );
    expect(withoutCampus).toBeDefined();
    expect(withoutCampus!.campus).toBe("Кампус уточняется");
    expect(withoutCampus!.city).toBeTruthy();
    expect(
      filterHseExplorerRows([withoutCampus!], { campus: withoutCampus!.city }),
    ).toEqual([]);
  });

  it("retains program-specific admission conditions from the selected generic offering", () => {
    const catalog = baselineCatalog();
    const directory = catalog.directoryDetails.find(
      (row) => row.universitySlug !== "hse" && row.offerings.length > 0,
    )!;
    const source = directory.offerings[0];
    const admissionDetails = {
      annualTuition: {
        ...catalog.programs[0].tuitionValue,
        value: 500000,
        year: 2027,
        status: "verified" as const,
      },
    };
    catalog.directoryDetails = [
      {
        ...directory,
        offerings: [{ ...source, level: "Магистр", admissionDetails }],
      },
    ];
    const rows = educationPathwayRows(catalog, "master");
    expect(rows).toHaveLength(1);
    expect(rows[0].admission).toEqual(admissionDetails);
    expect(
      filterHseExplorerRows(rows, {
        year: "2027",
        maxTuition: "500000",
        conditions: "known",
      }),
    ).toHaveLength(1);
    expect(filterHseExplorerRows(rows, { maxTuition: "499999" })).toEqual([]);
  });

  it("preserves specific master prices, exams and campuses without inventing a current intake for generic offerings", () => {
    const catalog = baselineCatalog();
    const rows = educationPathwayRows(catalog, "master");
    const hse = rows.filter((row) => row.universitySlug === "hse");
    expect(hse.length).toBeGreaterThan(200);
    expect(new Set(hse.map((row) => row.campus)).size).toBe(4);
    const law = hse.find(
      (row) => row.title === "ИТ-юрист" && row.campus === "Пермь",
    )!;
    expect(law.masterTuition?.tuition.value).toBe(480000);
    expect(law.masterTuition?.exams.sourceUrl).toMatch(/hse\.ru/);
    expect(filterHseExplorerRows([law], { maxTuition: "479999" })).toEqual([]);
    expect(filterHseExplorerRows([law], { maxTuition: "480000" })).toHaveLength(
      1,
    );
    const unconfirmed = rows.find((row) => !row.masterTuition);
    if (unconfirmed) {
      expect(filterHseExplorerRows([unconfirmed], {})).toHaveLength(1);
      expect(filterHseExplorerRows([unconfirmed], { year: "2026" })).toEqual(
        [],
      );
    }
  });

  it("does not project HSE resources or offerings from another revision", () => {
    const catalog = baselineCatalog();
    catalog.directoryDetails = catalog.directoryDetails.map((row) =>
      row.universitySlug === "hse"
        ? { ...row, offerings: [], admissionResources: undefined }
        : row,
    );
    expect(
      educationPathwayRows(catalog, "master").filter(
        (row) => row.universitySlug === "hse",
      ),
    ).toEqual([]);
    expect(
      educationPathwayRows(catalog, "aspirantura").filter(
        (row) => row.universitySlug === "hse",
      ),
    ).toEqual([]);
  });

  it("keeps Russian doctoral preparation separate from HSE postgraduate and DPO offerings", () => {
    const catalog = baselineCatalog();
    expect(
      educationPathwayRows(catalog, "doctorate").filter(
        (row) => row.universitySlug === "hse",
      ),
    ).toEqual([]);
    const hsePostgraduate = educationPathwayRows(catalog, "aspirantura").filter(
      (row) => row.universitySlug === "hse",
    );
    expect(hsePostgraduate.filter((row) => !row.admission)).toHaveLength(89);
  });
});
