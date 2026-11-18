import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hseMasterTuition } from "@/lib/hse-admissions";
import { hseExplorerData } from "@/lib/hse-explorer-data";
import type {
  HseDisplayFact,
  HseExplorerOffering,
} from "@/lib/hse-explorer-data";
import { HseProgramExplorer } from "./hse-program-explorer";

describe("HSE explorer filter controls", () => {
  it("renders labelled filters, admission-year choices and the limits of known conditions", () => {
    const props = hseExplorerData([], [], hseMasterTuition.slice(0, 15));
    const html = renderToStaticMarkup(<HseProgramExplorer {...props} />);
    for (const label of [
      "Найти программу ВШЭ",
      "Кампус ВШЭ",
      "Уровень образования ВШЭ",
      "Подразделение ВШЭ",
      "Форма обучения ВШЭ",
      "Оплата обучения ВШЭ",
      "Стоимость года до, ₽",
      "Год набора ВШЭ",
      "Известные условия ВШЭ",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-describedby="hse-filter-evidence"');
    expect(html).toContain(
      "Цены отдельных курсов не считаются годовой стоимостью",
    );
    expect(html).toContain("Неизвестные значения остаются в общей выдаче");
    expect(html).toContain("Есть подтверждённые условия");
    expect(html).toContain("Условия нужно сверить");
    expect(html).toContain("Все годы, включая неуказанные");
    expect(html).toContain(">2026</option>");
    expect(html.match(/<article /g)).toHaveLength(12);
    expect(html).toContain("Показать ещё 3");
    expect(html).not.toContain("Год набора в общем каталоге не указан");
    const faculty = props.masterTuition.find((row) => row.faculty)?.faculty;
    expect(faculty).toBeTruthy();
    expect(html).toContain(faculty!);
  });

  it("shows aggregate graduate-program facts and preserves their scope note without allocating places to specialties", () => {
    const sourceUrl = "https://aspirantura.hse.ru/2026/";
    const fact = <T,>(
      value: T | null,
      status: HseDisplayFact<T>["status"] = "verified",
    ): HseDisplayFact<T> => ({ value, status, year: 2026, sourceUrl });
    const offering: HseExplorerOffering = {
      id: "asp-admission",
      code: "1.1",
      title: "Программа подготовки по математике",
      profile: "1.1.1 Анализ; 1.1.2 Дифференциальные уравнения",
      level: "Аспирантура",
      forms: "Очная",
      duration: "4 года",
      campus: "Москва",
      sourceUrl,
      admission: {
        budgetPlaces: fact(30),
        paidPlaces: fact<number>(null, "not_applicable"),
        annualTuition: fact<number>(null, "not_published"),
        exams: fact("Специальная дисциплина"),
        priorEducation: fact("Специалитет или магистратура"),
        note: "Места относятся к программе в целом. Платного набора в 2026 году нет.",
      },
    };
    const html = renderToStaticMarkup(
      <HseProgramExplorer programs={[]} offerings={[offering]} />,
    );
    expect(html.match(/<article /g)).toHaveLength(1);
    expect(html).toContain("Места относятся к программе в целом");
    expect(html).toContain("Платного набора в 2026 году нет");
    expect(html).toContain("Не применяется");
    expect(html).toContain("Специальная дисциплина");
    expect(html).toContain("Предыдущее образование");
    expect(html).toContain("Специалитет или магистратура");
    expect(html.match(/>30<\/a>/g)).toHaveLength(1);
    expect(html).not.toContain("Год набора в общем каталоге не указан");
  });

  it("does not promote an unverified master's exam string to a confirmed admission condition", () => {
    const props = hseExplorerData([], [], hseMasterTuition.slice(0, 1));
    props.masterTuition[0].exams = {
      ...props.masterTuition[0].exams,
      value: "Непроверенное испытание",
      status: "pending_review",
    };
    const html = renderToStaticMarkup(<HseProgramExplorer {...props} />);
    expect(html).not.toContain("Непроверенное испытание");
  });
});
