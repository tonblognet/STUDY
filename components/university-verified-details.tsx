import {
  formatDirectoryDate,
  directoryEvidenceSummary,
  type DirectoryDetails,
} from "@/lib/university-directory-details";

const labels = {
  fullName: "Юридическое наименование",
  shortName: "Официальное сокращение",
  regDate: "Дата создания по сведениям вуза",
  address: "Адрес организации",
  telephone: "Общий телефон вуза",
  email: "Общая электронная почта",
  admissionsUrl: "Раздел для поступающих",
} as const;

export function UniversityVerifiedDetails({
  details,
}: {
  details: DirectoryDetails;
}) {
  const evidence = directoryEvidenceSummary(details);
  const missing = Object.entries(labels).filter(
    ([key]) => !details.fields[key as keyof typeof labels],
  );
  return (
    <section className="university-verified-details">
      <h2>Сведения и документы вуза</h2>
      <p className="university-evidence-overview">
        {evidence.checkedAt
          ? `Последняя проверка основных сведений: ${formatDirectoryDate(evidence.checkedAt)}.`
          : "Основные сведения в этом разделе ещё уточняются."}{" "}
        Проверка контактов и адреса не подтверждает текущую лицензию или набор.
      </p>
      {missing.length > 0 && (
        <details className="university-missing-fields">
          <summary>
            Что ещё нужно уточнить в этом разделе · {missing.length}
          </summary>
          <ul>
            {missing.map(([key, label]) => (
              <li key={key}>{label}</li>
            ))}
          </ul>
        </details>
      )}
      {details.educationAreas.length > 0 && (
        <details className="university-education-areas">
          <summary>
            Области образования по мониторингу 2025 (
            {details.educationAreas.length})
          </summary>
          <p>
            Укрупнённые группы из отчёта Минобрнауки. Они описывают профиль вуза
            в период мониторинга и не подтверждают текущий набор.
          </p>
          <ul>
            {details.educationAreas.map((area) => (
              <li key={area.code}>
                {area.code} — {area.title}
              </li>
            ))}
          </ul>
          <a
            href={details.educationAreas[0].sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Открыть отчёт мониторинга ↗
          </a>
        </details>
      )}
      {Object.keys(details.fields).length > 0 ? (
        <dl className="university-details-grid">
          {Object.entries(labels).map(([key, label]) => {
            const field = details.fields[key as keyof typeof labels];
            return field ? (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{field.value}</dd>
                <dd>
                  <a href={field.sourceUrl} target="_blank" rel="noreferrer">
                    Источник ↗
                  </a>{" "}
                  · проверено {formatDirectoryDate(field.checkedAt)}
                </dd>
              </div>
            ) : null;
          })}
        </dl>
      ) : (
        <p>
          Подробные сведения ещё не подтверждены по доступным официальным
          страницам.
        </p>
      )}
      <div className="university-license-evidence">
        <h3>Лицензия на образовательную деятельность</h3>
        {details.licenseExtract ? (
          <>
            <p>
              <strong>{details.licenseExtract.number}</strong>
            </p>
            <p>
              Статус в выписке: {details.licenseExtract.statusAsPublished}. Дата
              выписки:{" "}
              <strong>
                {formatDirectoryDate(details.licenseExtract.asOf)}
              </strong>
              .
            </p>
            <a
              href={details.licenseExtract.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Открыть выписку из реестра ↗
            </a>
          </>
        ) : (
          <p>Выписка с номером, статусом и датой пока не проверена.</p>
        )}
        <p className="university-muted">{details.licenseRegistry.note}</p>
        {details.documents.length > 0 && (
          <details>
            <summary>
              Документы, опубликованные вузом ({details.documents.length})
            </summary>
            <ul>
              {details.documents.map((document) => (
                <li key={document.url}>
                  <a href={document.url} target="_blank" rel="noreferrer">
                    {document.label ||
                      (document.kind === "accreditationDocLink"
                        ? "Документ об аккредитации"
                        : "Документ о лицензии")}{" "}
                    ↗
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
