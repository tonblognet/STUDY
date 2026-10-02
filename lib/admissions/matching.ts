import type { Program } from "@/lib/data";
import { MATCH_RULES } from "./constants";
import { additionalExamKey, getAdditionalExams, isCurrentFact } from "./exams";
import type { MatchResult, ScoreSet } from "./types";

const validScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 100;

type Candidate = { subject: string; score: number; minimum: number };

// Maximize a complete assignment without counting the same subject twice.
function bestAssignment(groups: Candidate[][]): Candidate[] | null {
  const memo = new Map<string, Candidate[] | null>();
  function visit(index: number, used: Set<string>): Candidate[] | null {
    if (index === groups.length) return [];
    const key = `${index}:${[...used].sort().join("|")}`;
    if (memo.has(key)) return memo.get(key)!;
    let best: Candidate[] | null = null;
    for (const candidate of groups[index]) {
      if (used.has(candidate.subject)) continue;
      const rest = visit(index + 1, new Set([...used, candidate.subject]));
      if (rest === null) continue;
      const next = [candidate, ...rest];
      if (
        best === null ||
        next.reduce((sum, item) => sum + item.score, 0) >
          best.reduce((sum, item) => sum + item.score, 0)
      )
        best = next;
    }
    memo.set(key, best);
    return best;
  }
  return visit(0, new Set());
}

export function matchProgram(
  program: Program,
  scoreSet: ScoreSet,
): MatchResult {
  const year = program.trust.dataYear;
  const blockers: string[] = [];
  const requirementsMissing: string[] = [];
  const comparisonMissing: string[] = [];
  const scoreMissing: string[] = [];
  const reasons: string[] = [];
  const required = program.examRequirements.filter((item) => item.required);
  if (!required.length)
    requirementsMissing.push(
      "официальный набор вступительных испытаний не сопоставлен",
    );
  if (
    required.length > 10 ||
    required.some((item) => item.subjects.length > 10)
  )
    requirementsMissing.push(
      "набор испытаний выходит за поддерживаемые границы расчёта",
    );

  const groups = required.slice(0, 10).map((requirement) => {
    const entered = requirement.subjects
      .slice(0, 10)
      .filter((subject) => scoreSet.scores?.[subject] !== undefined);
    const eligible: Candidate[] = [];
    const unknown: string[] = [];
    const failed: string[] = [];
    for (const subject of entered) {
      const score = scoreSet.scores[subject];
      const minimum = requirement.subjectMinimums
        ? requirement.subjectMinimums[subject]
        : requirement.minimum;
      if (!validScore(score))
        unknown.push(`${subject}: введите целое число от 0 до 100`);
      else if (!isCurrentFact(minimum, year) || !validScore(minimum.value))
        unknown.push(`нет проверенного минимума ${year} года: ${subject}`);
      else if (score < minimum.value)
        failed.push(`${subject}: ${score}, минимум ${minimum.value}`);
      else eligible.push({ subject, score, minimum: minimum.value });
    }
    if (!entered.length)
      requirementsMissing.push(
        `не введён предмет: ${requirement.subjects.join(" или ")}`,
      );
    else if (!eligible.length) {
      if (unknown.length) requirementsMissing.push(...unknown);
      else blockers.push(...failed);
    } else if (unknown.length) scoreMissing.push(...unknown);
    return eligible;
  });
  const supportedSubjects =
    new Set(groups.flatMap((group) => group.map((item) => item.subject)))
      .size <= 10;
  if (!supportedSubjects)
    requirementsMissing.push("слишком много разных предметов для расчёта");
  const assignment = supportedSubjects ? bestAssignment(groups) : null;
  if (
    supportedSubjects &&
    required.length &&
    groups.every((group) => group.length) &&
    !assignment
  ) {
    const missingAlternatives = [
      ...new Set(
        required.flatMap((requirement) =>
          requirement.subjects.filter(
            (subject) => scoreSet.scores?.[subject] === undefined,
          ),
        ),
      ),
    ];
    (scoreMissing.length || missingAlternatives.length
      ? requirementsMissing
      : blockers
    ).push("один предмет нельзя зачесть дважды в разных группах испытаний");
    if (missingAlternatives.length)
      requirementsMissing.push(
        `для отдельного зачёта нужны результаты альтернатив: ${missingAlternatives.join(" или ")}`,
      );
  }
  let examTotal = 0;
  for (const selected of assignment ?? []) {
    examTotal += selected.score;
    reasons.push(
      `учтён предмет: ${selected.subject} — ${selected.score}; минимум ${selected.minimum}`,
    );
  }
  if (program.examRequirements.some((item) => !item.required))
    reasons.push("необязательные группы не добавляются к конкурсной сумме");

  const exams = getAdditionalExams(program);
  let examScale = required.length * 100;
  if (
    !exams.length &&
    !(
      program.dviValue.status === "not_applicable" &&
      program.dviValue.year === year
    )
  )
    requirementsMissing.push(
      `не подтверждено наличие или отсутствие ДВИ в ${year} году`,
    );
  for (const exam of exams) {
    const label = exam.title.value ?? "дополнительное испытание";
    const legacy =
      exam.id === "dvi" && scoreSet.dviProgramSlug === program.slug
        ? scoreSet.dviScore
        : undefined;
    const score =
      scoreSet.additionalExamScores?.[additionalExamKey(program, exam)] ??
      legacy;
    if (
      !isCurrentFact(exam.title, year) ||
      !isCurrentFact(exam.minimum, year) ||
      !isCurrentFact(exam.maximum, year) ||
      !validScore(exam.minimum.value) ||
      !validScore(exam.maximum.value) ||
      exam.maximum.value < exam.minimum.value ||
      exam.maximum.value === 0
    ) {
      requirementsMissing.push(
        `нет проверенного названия, минимума или максимума ДВИ «${label}» за ${year} год`,
      );
      continue;
    }
    examScale += exam.maximum.value;
    if (!validScore(score))
      requirementsMissing.push(
        `нужен результат ДВИ «${label}» для ${program.universityShort}: целое число от 0 до ${exam.maximum.value}`,
      );
    else if (score > exam.maximum.value)
      requirementsMissing.push(
        `балл ДВИ «${label}» выше официального максимума ${exam.maximum.value}`,
      );
    else if (score < exam.minimum.value)
      blockers.push(
        `ДВИ: ${score}, минимум ${exam.minimum.value} («${label}»)`,
      );
    else {
      examTotal += score;
      reasons.push(`ДВИ «${label}»: ${score}; минимум ${exam.minimum.value}`);
    }
  }

  const eligibility = blockers.length
    ? "ineligible"
    : requirementsMissing.length
      ? "unknown"
      : "eligible";
  let achievements = 0;
  const requested = scoreSet.individualAchievements;
  if (!Number.isInteger(requested) || requested < 0 || requested > 10)
    scoreMissing.push(
      "индивидуальные достижения: введите целое число от 0 до 10",
    );
  else if (requested > 0) {
    const limit = program.individualAchievementsMax;
    if (
      !isCurrentFact(limit, year) ||
      !Number.isInteger(limit.value) ||
      limit.value < 0 ||
      limit.value > 10
    )
      scoreMissing.push(
        `нет проверенного лимита индивидуальных достижений за ${year} год`,
      );
    else {
      achievements = Math.min(requested, limit.value);
      reasons.push(
        `индивидуальные достижения: учтено ${achievements} из ${requested}; лимит ${limit.value}`,
      );
    }
  }
  const consideredScore =
    eligibility === "eligible" && !scoreMissing.length
      ? examTotal + achievements
      : null;
  const historical = program.passingScoreValue;
  const passingScore =
    historical.status === "verified" && historical.value !== null
      ? historical.value
      : null;
  if (passingScore === null)
    comparisonMissing.push("проверенный проходной балл не опубликован");
  else if (historical.year !== year - 1)
    comparisonMissing.push(
      `проходной балл относится к ${historical.year} году; нужен ориентир кампании ${year - 1}`,
    );
  if (
    program.passingScoreExamScale == null ||
    program.passingScoreExamScale !== examScale
  )
    comparisonMissing.push(
      `шкала проходного балла не сопоставима с набором испытаний ${year} года или не проверена`,
    );
  const margin =
    consideredScore !== null &&
    passingScore !== null &&
    !comparisonMissing.length
      ? consideredScore - passingScore
      : null;
  if (consideredScore !== null)
    reasons.push(`сумма учитываемых баллов: ${consideredScore}`);
  if (margin !== null)
    reasons.push(
      `ориентир — проходной балл ${passingScore} за ${historical.year} год`,
    );
  reasons.push(
    "проверка минимумов не подтверждает право подачи документов и не гарантирует зачисление; иные условия уточняйте в приёмной комиссии",
  );

  return {
    eligibility,
    blockers,
    requirementsMissing: [...requirementsMissing, ...scoreMissing],
    comparisonMissing,
    category:
      margin === null
        ? "insufficient"
        : margin >= MATCH_RULES.highMargin
          ? "high"
          : margin >= 0
            ? "competitive"
            : "ambitious",
    consideredScore,
    passingScore,
    margin,
    // Historical records do not carry per-year comparable exam structures.
    trend: null,
    reasons,
    missing: [
      ...blockers,
      ...requirementsMissing,
      ...scoreMissing,
      ...comparisonMissing,
    ],
  };
}

export function groupMatches(programs: Program[], scoreSet: ScoreSet) {
  const order = { eligible: 0, unknown: 1, ineligible: 2 };
  return programs
    .map((program) => ({ program, match: matchProgram(program, scoreSet) }))
    .sort(
      (a, b) =>
        order[a.match.eligibility] - order[b.match.eligibility] ||
        (b.match.margin ?? -Infinity) - (a.match.margin ?? -Infinity) ||
        a.program.slug.localeCompare(b.program.slug),
    );
}
