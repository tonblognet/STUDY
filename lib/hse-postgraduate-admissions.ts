import snapshot from "@/data-sources/release/2026-12/evidence/2026-11-18-education-pathways.json";
import type {
  DataStatus,
  SourceKind,
  SourcedValue,
} from "@/lib/admissions/types";
import type { UniversityOffering } from "@/lib/university-directory-details";

type SpecialtyRow =
  (typeof snapshot.aspAdmission2026.scientificSpecialtyProgrammeCampusRows)[number];
type BudgetRow = (typeof snapshot.aspAdmission2026.budgetTable.rows)[number];
type Campus = keyof BudgetRow["campusBudgetPlaces"];

const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
const budgetRows = snapshot.aspAdmission2026.budgetTable.rows;
const rulesSourceId = "asp-rules-current-docx";

function sourceFor(id: string) {
  const source = sources.get(id);
  if (!source) throw new Error(`Missing HSE postgraduate source: ${id}`);
  return source;
}

function fact<T>(
  value: T | null,
  sourceId: string,
  section: string,
  status: DataStatus = value === null ? "pending_review" : "verified",
  note?: string,
): SourcedValue<T> {
  const source = sourceFor(sourceId);
  return {
    value,
    year: 2026,
    status,
    sourceKind: (sourceId === rulesSourceId ? "docx" : "html") as SourceKind,
    sourceUrl: source.url,
    sourceName: "НИУ ВШЭ",
    sourceDocumentTitle: source.title,
    sourceSection: section,
    retrievedAt: source.retrievedAt,
    checkedAt: source.checkedAt,
    checkedBy: "Редакция Поступай",
    note,
  };
}

function groupId(campus: string, title: string): string {
  // A stable identifier depends on the published identity, not table order.
  let hash = 2166136261;
  for (const character of `${campus}\u0000${title}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `hse-asp-2026-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function budgetFor(title: string) {
  // Different published titles are not aliases without additional evidence.
  return budgetRows.find(
    (row) => row.programTitleAsPublished === title && title !== "Итого",
  );
}

function budgetNote(row: BudgetRow | undefined, campus: Campus): string {
  if (!row) {
    return "Точное соответствие названия программы строке бюджетного плана требует проверки. Места не назначены по сходству названий.";
  }
  if (row.campusBudgetPlaces[campus] === null) {
    return "В бюджетной таблице ячейка этого кампуса пуста. Пустое значение сохранено неизвестным и не заменено нулём.";
  }
  const group = row.groupTotal;
  const scope = budgetRows
    .slice(group.originRow - 1, group.originRow - 1 + group.rowSpan)
    .map((entry) => `«${entry.programTitleAsPublished}»`)
    .join(", ");
  return `Места относятся к программе в кампусе ${campus} и общие для перечисленных научных специальностей. Общий КЦП ${group.value} относится к ${group.rowSpan > 1 ? "группе программ" : "программе"} ${scope} во всех кампусах; он не прибавляется к местам программы и не назначается каждой специальности.`;
}

const groups = new Map<string, SpecialtyRow[]>();
for (const row of snapshot.aspAdmission2026
  .scientificSpecialtyProgrammeCampusRows) {
  const key = `${row.campus}\u0000${row.programTitle}`;
  const group = groups.get(key);
  if (group) group.push(row);
  else groups.set(key, [row]);
}

export const hsePostgraduateOfferings: UniversityOffering[] = Array.from(
  groups.values(),
  (specialties) => {
    const first = specialties[0];
    const campus = first.campus as Campus;
    const source = sourceFor(first.sourceId);
    const budget = budgetFor(first.programTitle);
    const reviewedBudget = snapshot.aspAdmission2026.reviewedBudgetMatches.find(
      (row) => row.campus === campus && row.programTitle === first.programTitle,
    );
    const places =
      reviewedBudget?.budgetPlaces ??
      budget?.campusBudgetPlaces[campus] ??
      null;
    const note = reviewedBudget
      ? `${reviewedBudget.note} Места общие для перечисленных научных специальностей программы; они не назначаются каждой специальности.`
      : budgetNote(budget, campus);
    const section = specialties
      .map(
        (row) =>
          `стр. ${row.sourceLocator.page}, таблица ${row.sourceLocator.table}, строка ${row.sourceLocator.row}`,
      )
      .join("; ");
    return {
      id: groupId(campus, first.programTitle),
      code: [...new Set(specialties.map((row) => row.code))].join(" / "),
      title: first.programTitle,
      profile: specialties
        .map((row) => `${row.code} ${row.specialtyTitle}`)
        .join("; "),
      level: "Аспирантура",
      forms: "Очная",
      duration: null,
      admissionsStatus: "pending_review",
      sourceUrl: source.url,
      sourceYear: 2026,
      checkedAt: source.checkedAt,
      sourceSha256: source.sha256,
      sourceSection: `${campus}; ${first.programTitle}; ${section}. Научные специальности объединены в одну программу кампуса.`,
      programUrl: "https://aspirantura.hse.ru/rules2026",
      campus,
      admissionDetails: {
        priorEducation: fact(
          "Специалитет или магистратура. Обучение в аспирантуре осуществляется по очной форме.",
          rulesSourceId,
          "Правила приёма, пункт 1.3; word/document.xml, (//w:p)[21]",
        ),
        exams: fact(
          "Портфолио; научная специальность; иностранный язык. Основной язык — английский; французский, немецкий, итальянский и испанский предусмотрены для аспирантских школ по филологическим, историческим и философским наукам. Каждое испытание оценивается по 50-балльной шкале; оценка «до 15 баллов» названа в правилах неудовлетворительной.",
          rulesSourceId,
          "Правила приёма, пункты 3.2–3.3; word/document.xml, (//w:p)[88]–(//w:p)[92]",
          "verified",
          "Числовой минимальный балл из формулировки «до 15 баллов» не вычислен. Программы испытаний проверяются по выбранному конкурсу; портфолио может содержать блокирующие элементы.",
        ),
        budgetPlaces: fact<number>(
          places,
          reviewedBudget?.sourceId ?? "asp-places",
          reviewedBudget?.sourceLocator ??
            (budget
              ? `Таблица ${budget.sourceLocator.table}, tbody строка ${budget.sourceLocator.tbodyRow}, колонка «${campus}»; ${budget.programTitleAsPublished}`
              : `Таблица 1, колонка «${campus}»; точное название «${first.programTitle}» не сопоставлено`),
          places === null ? "pending_review" : "verified",
          note,
        ),
        paidPlaces: fact<number>(
          null,
          "asp-price",
          "Стоимость обучения в аспирантуре: «В 2026 году прием на места с оплатой стоимости обучения не ведется»",
          "not_applicable",
          "Платного набора в 2026 году нет. Стоимость не назначается равной нулю.",
        ),
        note: `${note} Платный набор в 2026 году не ведётся. Это программа приёма 2026 года; текущий общий перечень научных специальностей учитывается отдельно.`,
      },
    };
  },
);
