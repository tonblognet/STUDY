import type { DataStatus, SourceKind, SourcedValue } from "./admissions/types";
import { universities, type University } from "./data";
import { getDirectoryDetails } from "./university-directory-details";

export type UniversityCampusFact = {
  id: string;
  name: string;
  address: SourcedValue<string>;
};

export type UniversityFactProfile = {
  universitySlug: string;
  facts: {
    website: SourcedValue<string>;
    logoUrl: SourcedValue<string>;
    address: SourcedValue<string>;
    dormitoryCount: SourcedValue<number>;
    militaryCenter: SourcedValue<boolean>;
  };
  campuses: UniversityCampusFact[];
};

type FactOverride<T> = {
  value: T;
  sourceUrl: string;
  sourceKind?: SourceKind;
  sourceSection: string;
  checkedAt?: string;
};

const CHECKED_AT = "2026-08-26T12:00:00.000Z";
const NEXT_REVIEW_AT = "2026-09-26T12:00:00.000Z";

const verifiedAddresses: Partial<Record<string, FactOverride<string>>> = {
  mgu: {
    value: "119991, Москва, Ленинские горы, д. 1",
    sourceUrl: "https://international.msu.ru/ru",
    sourceSection: "Контакты — адрес МГУ имени М. В. Ломоносова",
    checkedAt: "2026-08-27T12:00:00.000Z",
  },
  bmstu: {
    value: "Москва, 2-я Бауманская улица, 5, стр. 1",
    sourceUrl: "https://mil.bmstu.ru/",
    sourceSection: "Адреса — Москва",
  },
  mgimo: {
    value: "Москва, проспект Вернадского, 76",
    sourceUrl: "https://mgimo.ru/sveden/files/002507.pdf",
    sourceKind: "pdf",
    sourceSection: "Сведения об образовательной организации — адрес",
  },
  sechenov: {
    value: "Москва, улица Трубецкая, 8",
    sourceUrl: "https://www.sechenov.ru/admissions/",
    sourceSection: "Контакты для абитуриентов — адрес университета",
  },
};

const verifiedLogoSources: Partial<Record<string, string>> = {
  sechenov: "https://www.sechenov.ru/pressroom/brend/ofitsialnyy-logotip/",
};

function sourceKind(url: string): SourceKind {
  return new URL(url).pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
}

function fact<T>(
  value: T | null,
  status: DataStatus,
  sourceUrl: string,
  sourceName: string,
  extra: Partial<SourcedValue<T>> = {},
): SourcedValue<T> {
  return {
    value,
    year: 2026,
    status,
    sourceKind: sourceKind(sourceUrl),
    sourceUrl,
    sourceName,
    retrievedAt: CHECKED_AT,
    checkedAt: CHECKED_AT,
    checkedBy: "Редакция Поступай",
    nextReviewAt: NEXT_REVIEW_AT,
    ...extra,
  };
}

function buildProfile(university: University): UniversityFactProfile {
  const name = university.shortName;
  const factsSourceUrl = university.factsSourceUrl ?? university.website;
  const directory = university.directory;
  const currentAddress = getDirectoryDetails(university.slug)?.fields.address;
  const directoryReview = directory
    ? { checkedAt: directory.checkedAt, retrievedAt: directory.checkedAt }
    : {};
  const addressOverride =
    verifiedAddresses[university.slug] ??
    (currentAddress
      ? {
          value: currentAddress.value,
          sourceUrl: currentAddress.sourceUrl,
          sourceSection:
            "Основные сведения — адрес образовательной организации",
          checkedAt: currentAddress.checkedAt,
        }
      : undefined) ??
    (directory && university.address !== university.city
      ? {
          value: university.address,
          sourceUrl: directory.addressSourceUrl,
          sourceSection:
            "Общие сведения — адрес организации (не всех учебных корпусов)",
          checkedAt: directory.checkedAt,
        }
      : undefined);
  const address = addressOverride
    ? fact(addressOverride.value, "verified", addressOverride.sourceUrl, name, {
        sourceKind:
          addressOverride.sourceKind ?? sourceKind(addressOverride.sourceUrl),
        sourceSection: addressOverride.sourceSection,
        retrievedAt: addressOverride.checkedAt ?? CHECKED_AT,
        checkedAt: addressOverride.checkedAt ?? CHECKED_AT,
        ...(directory && !verifiedAddresses[university.slug]
          ? { year: currentAddress?.sourceYear ?? directory.sourceYear }
          : {}),
      })
    : fact<string>(
        university.address === university.city ? null : university.address,
        "pending_review",
        factsSourceUrl,
        name,
        {
          sourceSection: "Адрес и сведения об университете",
          ...directoryReview,
          ...(directory ? { year: directory.sourceYear } : {}),
          note: "Точный адрес кампуса ожидает проверку по отдельной официальной странице.",
        },
      );
  const logoSourceUrl =
    verifiedLogoSources[university.slug] ?? university.logoSourceUrl;
  const dormitoryCount = fact<number>(
    university.dormitoriesCount ?? null,
    "pending_review",
    factsSourceUrl,
    name,
    {
      sourceSection: "Кампус и общежития",
      ...directoryReview,
      note:
        university.dormitoriesCount === undefined
          ? "Официальное число общежитий ещё не подтверждено."
          : "Указанное число ожидает проверки по отдельному официальному документу.",
    },
  );
  const militaryCenter = university.militaryCenterSourceUrl
    ? fact(
        university.militaryCenter,
        university.militaryCenter === null ? "pending_review" : "verified",
        university.militaryCenterSourceUrl,
        name,
        {
          sourceSection: "Военный учебный центр",
          ...(university.slug === "mgu"
            ? {
                retrievedAt: "2026-09-08T00:00:00.000Z",
                checkedAt: "2026-09-08T00:00:00.000Z",
              }
            : {}),
          note:
            university.militaryCenter === true
              ? "Наличие ВУЦ подтверждено отдельной официальной страницей; доступ зависит от условий отбора."
              : "Статус ВУЦ ожидает проверки.",
        },
      )
    : fact<boolean>(null, "pending_review", factsSourceUrl, name, {
        sourceSection: "Военный учебный центр",
        ...directoryReview,
        note: "Отдельное официальное подтверждение наличия или отсутствия ВУЦ не зафиксировано.",
      });

  return {
    universitySlug: university.slug,
    facts: {
      website: fact(
        university.website,
        "verified",
        directory?.websiteSourceUrl ?? university.website,
        name,
        {
          sourceSection: "Официальный сайт университета",
          ...(directory
            ? {
                year: directory.sourceYear,
                checkedAt: directory.checkedAt,
                retrievedAt: directory.checkedAt,
              }
            : {}),
        },
      ),
      logoUrl: fact(
        university.logoUrl ?? null,
        university.logoUrl ? "verified" : "pending_review",
        logoSourceUrl,
        name,
        {
          sourceSection: "Официальный логотип или фирменный стиль",
          ...(!university.logoUrl ? directoryReview : {}),
          ...(directory?.logoCheckedAt
            ? {
                checkedAt: directory.logoCheckedAt,
                retrievedAt: directory.logoCheckedAt,
              }
            : {}),
          note: university.logoUrl
            ? "Asset опубликован официальным университетским ресурсом или сохранён локально с указанием официального источника."
            : "Официальный asset логотипа ещё не зафиксирован.",
        },
      ),
      address,
      dormitoryCount,
      militaryCenter,
    },
    campuses:
      address.value === null
        ? []
        : [
            {
              id: `${university.slug}-main`,
              name: directory ? "Адрес организации" : "Основной кампус",
              address,
            },
          ],
  };
}

export const universityFactProfiles = universities.map(buildProfile);

export function universitySourcedFields(
  profile: UniversityFactProfile,
): Array<[string, SourcedValue<unknown>]> {
  return [
    ["website", profile.facts.website],
    ["logo_url", profile.facts.logoUrl],
    ["address", profile.facts.address],
    ["dormitory_count", profile.facts.dormitoryCount],
    ["military_center", profile.facts.militaryCenter],
    ...profile.campuses.map(
      (campus) =>
        [`campus:${campus.id}:address`, campus.address] as [
          string,
          SourcedValue<unknown>,
        ],
    ),
  ];
}
