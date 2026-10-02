import type { DataStatus, MatchCategory } from "./types";

export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  verified: "Проверено",
  not_published: "Не опубликовано",
  pending_review: "Ожидает проверки",
  outdated: "Устарело",
  conflicting_sources: "Источники расходятся",
  not_applicable: "Не применяется",
};

export const MATCH_RULES = {
  highMargin: 15,
  ambitiousFloor: -20,
  maximumIndividualAchievements: 10,
  outdatedAfterDays: 180,
} as const;

export const MATCH_LABELS: Record<MatchCategory, string> = {
  high: "Выше исторического ориентира",
  competitive: "На уровне исторического ориентира",
  ambitious: "Ниже исторического ориентира",
  insufficient: "Сравнение недоступно",
};

export const ELIGIBILITY_LABELS = {
  eligible: "Минимумы испытаний выполнены",
  ineligible: "Требования испытаний не выполнены",
  unknown: "Требования нужно уточнить",
} as const;

export const EXAM_SUBJECTS = [
  "Русский язык",
  "Математика",
  "Информатика",
  "Физика",
  "География",
  "Химия",
  "Биология",
  "Обществознание",
  "История",
  "Литература",
  "Иностранный язык",
] as const;
