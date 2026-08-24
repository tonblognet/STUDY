import type { Program } from "@/lib/data";
import { MATCH_RULES } from "./constants";
import type { MatchResult, ScoreSet } from "./types";

const unreliable = new Set([
  "outdated",
  "conflicting_sources",
  "pending_review",
  "not_published",
]);

function trend(points: Program["passingHistory"]): number | null {
  const known = points
    .filter((point) => point.value !== null && point.status === "verified")
    .sort((a, b) => a.year - b.year);
  if (known.length < 2) return null;
  return (
    Math.round(
      ((known.at(-1)!.value! - known[0].value!) / (known.length - 1)) * 10,
    ) / 10
  );
}

export function matchProgram(
  program: Program,
  scoreSet: ScoreSet,
): MatchResult {
  const missing: string[] = [];
  const reasons: string[] = [];

  if (!program.examRequirements.length)
    missing.push("официальный набор вступительных испытаний не сопоставлен");
  if (program.passingScoreValue.value === null)
    missing.push("проходной балл не опубликован");
  if (unreliable.has(program.passingScoreValue.status))
    missing.push(
      `статус проходного балла: ${program.passingScoreValue.status}`,
    );

  let examTotal = 0;
  for (const requirement of program.examRequirements) {
    if (
      requirement.minimum.value === null ||
      unreliable.has(requirement.minimum.status)
    ) {
      missing.push(
        `нет проверенного минимума: ${requirement.label.toLowerCase()}`,
      );
      continue;
    }
    const candidates = requirement.subjects
      .map((subject) => ({ subject, score: scoreSet.scores[subject] }))
      .filter((entry): entry is { subject: string; score: number } =>
        Number.isFinite(entry.score),
      );
    if (!candidates.length) {
      missing.push(`не введён предмет: ${requirement.subjects.join(" или ")}`);
      continue;
    }
    const selected = candidates.sort((a, b) => b.score - a.score)[0];
    if (selected.score < requirement.minimum.value) {
      missing.push(
        `${selected.subject}: ${selected.score}, минимум ${requirement.minimum.value}`,
      );
      continue;
    }
    examTotal += selected.score;
    if (requirement.subjects.length > 1)
      reasons.push(
        `учтён лучший альтернативный предмет: ${selected.subject} — ${selected.score}`,
      );
  }

  if (program.dviValue.value) {
    if (!Number.isFinite(scoreSet.dviScore))
      missing.push(`нужен результат ДВИ «${program.dviValue.value}»`);
    else if (
      program.dviMax.value !== null &&
      scoreSet.dviScore! > program.dviMax.value
    )
      missing.push(
        `балл ДВИ выше официального максимума ${program.dviMax.value}`,
      );
    else examTotal += scoreSet.dviScore!;
  }

  const achievementsLimit =
    program.individualAchievementsMax.value ??
    MATCH_RULES.maximumIndividualAchievements;
  const achievements = Math.min(
    Math.max(scoreSet.individualAchievements || 0, 0),
    achievementsLimit,
  );
  const consideredScore = missing.length ? null : examTotal + achievements;
  const passingScore = program.passingScoreValue.value;
  const margin =
    consideredScore !== null && passingScore !== null
      ? consideredScore - passingScore
      : null;
  const currentTrend = trend(program.passingHistory);

  if (missing.length || margin === null) {
    return {
      category: "insufficient",
      consideredScore,
      passingScore,
      margin,
      trend: currentTrend,
      reasons,
      missing,
    };
  }
  reasons.push(`сумма учитываемых баллов: ${consideredScore}`);
  reasons.push(
    `ориентир — реальный проходной балл ${passingScore} за ${program.passingScoreValue.year} год`,
  );
  if (currentTrend !== null)
    reasons.push(
      `среднее изменение между опубликованными годами: ${currentTrend > 0 ? "+" : ""}${currentTrend} балла`,
    );
  reasons.push(
    "исторический проходной балл не гарантирует зачисление в новой кампании",
  );

  if (margin >= MATCH_RULES.highMargin)
    return {
      category: "high",
      consideredScore,
      passingScore,
      margin,
      trend: currentTrend,
      reasons,
      missing,
    };
  if (margin >= 0)
    return {
      category: "competitive",
      consideredScore,
      passingScore,
      margin,
      trend: currentTrend,
      reasons,
      missing,
    };
  if (margin >= MATCH_RULES.ambitiousFloor)
    return {
      category: "ambitious",
      consideredScore,
      passingScore,
      margin,
      trend: currentTrend,
      reasons,
      missing,
    };
  return {
    category: "ambitious",
    consideredScore,
    passingScore,
    margin,
    trend: currentTrend,
    reasons: [
      ...reasons,
      `дефицит превышает ${Math.abs(MATCH_RULES.ambitiousFloor)} баллов`,
    ],
    missing,
  };
}

export function groupMatches(programs: Program[], scoreSet: ScoreSet) {
  return programs
    .map((program) => ({ program, match: matchProgram(program, scoreSet) }))
    .sort((a, b) => {
      const order = { high: 0, competitive: 1, ambitious: 2, insufficient: 3 };
      return (
        order[a.match.category] - order[b.match.category] ||
        (b.match.margin ?? -999) - (a.match.margin ?? -999)
      );
    });
}
