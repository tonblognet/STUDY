import type {
  AdmissionCampaign,
  CampaignFact,
} from "@/lib/university-admission-campaigns";
import { formatDirectoryDate } from "@/lib/university-directory-details";

function Fact({
  label,
  fact,
  campaign,
  suffix = "",
}: {
  label: string;
  fact: CampaignFact<string | number>;
  campaign: AdmissionCampaign;
  suffix?: string;
}) {
  const source = fact.source ? campaign.sources[fact.source] : undefined;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {fact.value === null
          ? "Не подтверждено"
          : `${typeof fact.value === "number" ? fact.value.toLocaleString("ru-RU") : fact.value}${suffix}`}
      </dd>
      {source && (
        <dd>
          <a href={source.url} target="_blank" rel="noreferrer">
            Источник ↗
          </a>{" "}
          · {formatDirectoryDate(source.checkedAt)}
          <small>{fact.section}</small>
        </dd>
      )}
    </div>
  );
}

export function UniversityAdmissionCampaign({
  campaign,
}: {
  campaign: AdmissionCampaign;
}) {
  const period = campaign.mainApplicationPeriod;
  return (
    <section
      className="university-offerings university-admission-campaign"
      aria-labelledby="admission-campaign-heading"
    >
      <h2 id="admission-campaign-heading">Условия приёма {campaign.year}</h2>
      <p>
        {campaign.campus} · Бакалавриат · {campaign.groups.length} конкурсных
        групп с подтверждёнными сведениями. Полнота условий по каждой группе
        уточняется.
      </p>
      <p>
        Здесь два отдельных творческих и профессиональных испытания. Эти группы
        пока не участвуют в автоматическом подборе по ЕГЭ.
      </p>
      <details>
        <summary>Минимальные баллы и сроки основного приёма</summary>
        <ul>
          {campaign.examMinimums.map((exam) => (
            <li key={exam.title}>
              {exam.title}: минимум {exam.minimum} ·{" "}
              <a
                href={campaign.sources[exam.source].url}
                target="_blank"
                rel="noreferrer"
              >
                Источник ↗
              </a>
            </li>
          ))}
        </ul>
        <p>
          Основной приём документов: {formatDirectoryDate(period.opens)} —{" "}
          {formatDirectoryDate(period.closes)}.{" "}
          <a
            href={campaign.sources[period.source].url}
            target="_blank"
            rel="noreferrer"
          >
            Правила приёма ↗
          </a>{" "}
          · {period.section}
        </p>
        <p>
          Минимальные баллы означают допуск к конкурсу, а не проходной балл.
        </p>
      </details>
      <div className="university-offering-grid">
        {campaign.groups.map((group) => (
          <article key={group.id}>
            <span className="overline">
              {group.code} · {group.form}
            </span>
            <h3>{group.title}</h3>
            <p>{group.profiles.map((profile) => profile.title).join("; ")}</p>
            {group.sharedPlaces && (
              <p className="university-campaign-shared">
                Места общие для перечисленных профилей. Указанное количество
                учитывается один раз.
              </p>
            )}
            <dl>
              <Fact
                label="Срок обучения"
                fact={group.duration}
                campaign={campaign}
              />
              <Fact
                label="Бюджетные места, включая квоты"
                fact={group.budgetPlaces}
                campaign={campaign}
              />
              <Fact
                label="Платные места"
                fact={group.paidPlaces}
                campaign={campaign}
              />
              <Fact
                label="Тариф на год обучения"
                fact={group.tuition}
                campaign={campaign}
                suffix=" ₽ / год"
              />
            </dl>
            <details>
              <summary>Вступительные испытания по профилям</summary>
              {group.profiles.map((profile) => (
                <div key={profile.title}>
                  <h4>{profile.title}</h4>
                  <ul>
                    {profile.exams.map((exam) => (
                      <li key={exam}>{exam}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <a
                href={campaign.sources.exams.url}
                target="_blank"
                rel="noreferrer"
              >
                Перечень испытаний ↗
              </a>
            </details>
          </article>
        ))}
      </div>
      <ul>
        {campaign.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <a href={campaign.admissionsUrl} target="_blank" rel="noreferrer">
        Приёмная кампания на сайте вуза ↗
      </a>
    </section>
  );
}
