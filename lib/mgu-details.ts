import details from "@/data-sources/universities/msu/program-details-2026.json";
import contacts from "@/data-sources/universities/msu/contacts-2026.json";
import type { MguCatalogProgram } from "./mgu-data";
import { mguFact, MGU_RULES_SOURCE } from "./mgu-admissions";

export function getMguDetails(program: MguCatalogProgram) {
  const detail = details.programs.find(
    (item) =>
      item.faculty === program.faculty &&
      item.code === program.code &&
      item.description === program.description,
  );
  const contact = contacts.contacts.find(
    (item) => item.faculty === program.faculty,
  );
  const tuition = detail?.tuition;
  const duration = detail?.duration;
  return {
    tuition: mguFact<number>(
      tuition?.value ?? null,
      tuition?.sourceUrl ?? contact?.website ?? contacts.sourceUrl,
      tuition?.sourceSection ??
        `${program.faculty} — стоимость 2026 не подтверждена`,
      {
        ...(tuition
          ? { checkedAt: tuition.checkedAt, retrievedAt: tuition.checkedAt }
          : {}),
        note: tuition
          ? "Рублей за учебный год для граждан РФ и поступающих на равных правах. Проживание оплачивается отдельно. Условия последующих лет определяются договором."
          : "Актуальная цена для этой конкурсной группы не подтверждена. Уточните её в приёмной комиссии; цену прошлого года не подставляем.",
      },
    ),
    duration: mguFact<string>(
      duration?.value ?? null,
      duration?.sourceUrl ?? contact?.website ?? contacts.sourceUrl,
      duration?.sourceSection ??
        `${program.faculty} — нормативный срок обучения требует подтверждения`,
      duration
        ? { checkedAt: duration.checkedAt, retrievedAt: duration.checkedAt }
        : {},
    ),
    contact: {
      address: mguFact(
        contact?.address ?? null,
        contacts.sourceUrl,
        `${program.faculty} — адрес приёмной комиссии`,
        contact?.address?.includes("до 28 июня")
          ? {
              status: "outdated",
              note: "Источник ограничивает действие адреса 28 июня. Перед поездкой уточните актуальное место приёма.",
            }
          : { note: "Адрес приёмной комиссии, не адрес всех учебных занятий." },
      ),
      phone: mguFact(
        contact?.phone ?? null,
        contacts.sourceUrl,
        `${program.faculty} — телефоны комиссии`,
      ),
      email: mguFact(
        contact?.email ?? null,
        contacts.sourceUrl,
        `${program.faculty} — электронная почта`,
      ),
      website: mguFact(
        contact?.website ?? null,
        contacts.sourceUrl,
        `${program.faculty} — официальный сайт комиссии`,
      ),
    },
  };
}

export const mguDormitoryConditions = mguFact(
  "Очная форма: для имеющих постоянную регистрацию за пределами Москвы и Московской области либо проживающих в Москве/области за пределами железнодорожных тарифных зон 0–5. На бюджете — по решению ЦПК; на платном обучении — при наличии свободного жилого фонда и с отдельной оплатой проживания. Конкретный корпус и заселение уточняются на факультете.",
  MGU_RULES_SOURCE,
  "Пункт 14 — предоставление общежития",
  {
    sourcePage: 9,
    note: "Продолжение пункта на странице 10 PDF. Не является гарантией заселения конкретного студента.",
  },
);
