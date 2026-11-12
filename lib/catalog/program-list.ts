import type { ExamFact } from "../admissions/exams";
import type { MatchProgramInput } from "../admissions/matching";
import type { FactValue, SourcedValue } from "../admissions/types";
import type { Program, University } from "../data";

export type ProgramListItem = MatchProgramInput &
  Pick<
    Program,
    | "id"
    | "universitySlug"
    | "university"
    | "title"
    | "code"
    | "faculty"
    | "form"
    | "level"
    | "subjects"
    | "passingScore"
    | "budgetPlaces"
    | "tuition"
  > & {
    trust: Pick<Program["trust"], "dataYear" | "status" | "completeness">;
    budgetPlacesValue: FactValue<number>;
    paidPlacesValue: FactValue<number>;
    tuitionValue: FactValue<number>;
    hostel: FactValue<boolean>;
    militaryCenter: FactValue<boolean>;
  };

export type ProgramListUniversity = Pick<
  University,
  "id" | "slug" | "shortName" | "color" | "logoUrl" | "logoBackground"
>;

function fact<T>({ value, year, status }: SourcedValue<T>): FactValue<T> {
  return { value, year, status };
}

function examFact<T>(source: SourcedValue<T>): ExamFact<T> {
  return { ...fact(source), sourceUrl: source.sourceUrl };
}

export function programListItem(program: Program): ProgramListItem {
  return {
    id: program.id,
    slug: program.slug,
    universitySlug: program.universitySlug,
    university: program.university,
    universityShort: program.universityShort,
    title: program.title,
    code: program.code,
    faculty: program.faculty,
    form: program.form,
    level: program.level,
    subjects: program.subjects,
    passingScore: program.passingScore,
    passingScoreValue: fact(program.passingScoreValue),
    passingScoreExamScale: program.passingScoreExamScale,
    budgetPlaces: program.budgetPlaces,
    budgetPlacesValue: fact(program.budgetPlacesValue),
    paidPlacesValue: fact(program.paidPlacesValue),
    tuition: program.tuition,
    tuitionValue: fact(program.tuitionValue),
    hostel: fact(program.hostel),
    militaryCenter: fact(program.militaryCenter),
    individualAchievementsMax: fact(program.individualAchievementsMax),
    dviValue: examFact(program.dviValue),
    dviMax: examFact(program.dviMax),
    dviMinimum: program.dviMinimum && examFact(program.dviMinimum),
    additionalExams: program.additionalExams?.map((exam) => ({
      id: exam.id,
      title: examFact(exam.title),
      minimum: examFact(exam.minimum),
      maximum: examFact(exam.maximum),
    })),
    examRequirements: program.examRequirements.map((requirement) => ({
      subjects: requirement.subjects,
      required: requirement.required,
      minimum: fact(requirement.minimum),
      subjectMinimums:
        requirement.subjectMinimums &&
        Object.fromEntries(
          Object.entries(requirement.subjectMinimums).map(
            ([subject, value]) => [subject, fact(value)],
          ),
        ),
    })),
    trust: {
      dataYear: program.trust.dataYear,
      status: program.trust.status,
      completeness: program.trust.completeness,
    },
  };
}
