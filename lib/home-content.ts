import type { SourcedValue } from "@/lib/admissions/types";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { EducationTrack } from "@/lib/education-pathways";

export type HomeEducationPath = {
  key: EducationTrack;
  label: string;
  headline: string;
  description: string;
  details: string[];
  action: string;
  href: string;
};

export const homeEducationPaths: HomeEducationPath[] = [
  {
    key: "college",
    label: "Колледж",
    headline: "Профессия начинается здесь",
    description:
      "Программы СПО после 9 или 11 класса. Сравните формы, сроки, опубликованные места и цены.",
    details: ["После 9 или 11 класса", "Аттестат и испытания по специальности"],
    action: "Смотреть колледжи",
    href: "/programs?track=college",
  },
  {
    key: "undergraduate",
    label: "Бакалавриат и специалитет",
    headline: "Найдите своё направление",
    description:
      "Первое высшее образование. Сравните программы, предметы, места, стоимость и проходные баллы по годам.",
    details: ["Бакалавриат и специалитет", "ЕГЭ и дополнительные испытания"],
    action: "Смотреть программы",
    href: "/programs",
  },
  {
    key: "master",
    label: "Магистратура",
    headline: "Глубже в профессию",
    description:
      "Новая специализация после высшего образования. Сравните испытания, места и стоимость обучения.",
    details: [
      "Вступительные испытания и портфолио",
      "Бюджет и платное обучение",
    ],
    action: "Смотреть магистратуру",
    href: "/programs?track=master",
  },
  {
    key: "aspirantura",
    label: "Аспирантура",
    headline: "Начните своё исследование",
    description:
      "Программы аспирантуры, научные специальности и опубликованные условия приёма.",
    details: [
      "Научная специальность и испытания",
      "Требования зависят от программы",
    ],
    action: "Смотреть аспирантуру",
    href: "/programs?track=aspirantura",
  },
  {
    key: "doctorate",
    label: "Докторантура",
    headline: "Шаг к докторской диссертации",
    description:
      "Официальные контакты и доступные сведения. Условия отдельных наборов пока уточняются.",
    details: [
      "Контакты и официальные сведения",
      "Набор, места и стоимость требуют проверки",
    ],
    action: "Информация о докторантуре",
    href: "/programs?track=doctorate",
  },
];

/** Select an example exclusively from the publication used to render the page. */
export function homeTuitionExample(catalog: CatalogSnapshot): {
  title: string;
  campus: string;
  tuition: SourcedValue<number>;
} | null {
  const resources = catalog.directoryDetails.find(
    (directory) => directory.universitySlug === "hse",
  )?.admissionResources;
  const example = resources?.masterTuition.find((row) => {
    const tuition = row.tuition;
    return (
      row.title === "ИТ-юрист" &&
      row.campus === "Пермь" &&
      tuition.status === "verified" &&
      tuition.value !== null &&
      Number.isFinite(tuition.value) &&
      tuition.value >= 0 &&
      Number.isInteger(tuition.year) &&
      tuition.year >= 1900 &&
      tuition.year <= 2200 &&
      /^https?:\/\//.test(tuition.sourceUrl)
    );
  });
  return example
    ? {
        title: example.title,
        campus: example.campus,
        tuition: { ...example.tuition },
      }
    : null;
}
