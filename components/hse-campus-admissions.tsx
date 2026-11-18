import type evidenceType from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-campus-services.json";
import styles from "./hse-campus-admissions.module.css";

const labels: Record<string, string> = {
  applications_open: "Начало приёма документов",
  budget_submission_ege_or_bvi: "Документы на бюджет по ЕГЭ и БВИ",
  budget_submission_internal_or_creative:
    "Документы на бюджет с испытаниями вуза",
  contract_submission_ege: "Документы на платное по ЕГЭ",
  contract_submission_internal_or_creative:
    "Документы на платное с испытаниями вуза",
  budget_ranked_lists: "Публикация конкурсных списков",
  budget_priority_consent: "Согласие на приоритетном этапе",
  budget_general_consent: "Согласие на основном этапе",
  budget_priority_enrollment_order: "Приказ приоритетного этапа",
  budget_general_enrollment_order: "Приказ основного этапа",
  contract_conclusion_deadline: "Завершение заключения договоров",
  contract_enrollment_deadline: "Завершение платного зачисления",
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeZone: "Europe/Moscow",
});

export function HseCampusAdmissions({
  data: evidence,
}: {
  data: typeof evidenceType;
}) {
  const sources: Record<string, { url: string }> = evidence.sources;
  return (
    <section className={styles.section} aria-labelledby="hse-campus-heading">
      <h2 id="hse-campus-heading">Сроки и условия в кампусах</h2>
      <p>
        Даты относятся к бакалавриату и специалитету 2026 года. Контакты
        общежитий и военной подготовки проверены 16 ноября 2026 года.
      </p>
      {evidence.campusAdmissionDeadlines.map((campus) => {
        const housing = evidence.housing.find(
          (row) => row.campus === campus.campus,
        )!;
        const military = evidence.militaryTraining.find(
          (row) => row.campus === campus.campus,
        )!;
        return (
          <details key={campus.campus} className={styles.campus}>
            <summary>{campus.campusName}</summary>
            <h3>Приёмная кампания {campus.admissionYear}</h3>
            <a
              href={sources[campus.deadlines[0].sourceKey].url}
              target="_blank"
              rel="noreferrer"
            >
              Информация приёмной комиссии ↗
            </a>
            <dl className={styles.deadlines}>
              {campus.deadlines.map((event) => (
                <div key={event.event}>
                  <dt>{labels[event.event]}</dt>
                  <dd>
                    <a
                      href={sources[event.sourceKey].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {dateFormat.format(
                        new Date(event.date + "T12:00:00+03:00"),
                      )}
                      {event.time ? `, ${event.time} МСК` : ""}
                    </a>
                    <p>{event.scope}</p>
                  </dd>
                </div>
              ))}
            </dl>
            <div className={styles.services}>
              <article>
                <h3>Общежития</h3>
                <p>{housing.contactUnit}</p>
                {"address" in housing && housing.address && (
                  <p>{housing.address}</p>
                )}
                <p>{housing.phoneRaw}</p>
                {"email" in housing && housing.email && (
                  <a href={`mailto:${housing.email}`}>{housing.email}</a>
                )}
                <a
                  href={sources[housing.contactSourceKey].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Контакты и адреса ↗
                </a>
                <a
                  href={housing.allocationRulesUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Порядок предоставления места ↗
                </a>
                <p>
                  Заселение зависит от категории студента и правил кампуса.
                  Тарифы и наличие мест проверяются по году поступления.
                </p>
              </article>
              <article>
                <h3>Военная подготовка</h3>
                <p>{military.address}</p>
                <p>{military.phoneRaw}</p>
                {military.emails.map((email) => (
                  <a key={email} href={`mailto:${email}`}>
                    {email}
                  </a>
                ))}
                <a
                  href={sources[military.sourceKey].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Военный учебный центр ↗
                </a>
                {military.admissionUrl && (
                  <a
                    href={military.admissionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Условия конкурсного отбора ↗
                  </a>
                )}
                <p>
                  Доступность подготовки зависит от программы, здоровья и
                  отдельного отбора. Год набора указан на странице ВУЦ.
                </p>
              </article>
            </div>
          </details>
        );
      })}
    </section>
  );
}
