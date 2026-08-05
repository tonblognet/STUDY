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
  high: "Высокий запас",
  competitive: "Конкурентный вариант",
  ambitious: "Амбициозный вариант",
  insufficient: "Недостаточно данных для оценки",
};

export const EXAM_SUBJECTS = [
  "Русский язык",
  "Математика",
  "Информатика",
  "Физика",
  "Химия",
  "Биология",
  "Обществознание",
  "История",
  "Литература",
  "Иностранный язык",
] as const;
