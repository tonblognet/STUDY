"use client";

import Link from "next/link";
import { useState } from "react";
import { calculateCompleteness } from "@/lib/admissions/completeness";
import { matchProgram } from "@/lib/admissions/matching";
import type { ScoreSet } from "@/lib/admissions/types";
import type { Program } from "@/lib/data";
import { formatPrice } from "@/lib/catalog/format";
import {
  CompletenessBadge,
  DataStatusBadge,
  SourcedMetric,
} from "@/components/data-status";
import { HistoryChart } from "@/components/history-chart";
import { SavedProgramActions } from "@/components/saved-program-actions";
import { ProgramRequirement } from "./program-requirement";
import { ProgramContacts } from "./program-contacts";

export function ProgramDecisionPage({ program }: { program: Program }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [achievements, setAchievements] = useState(0);
  const [dvi, setDvi] = useState<number | undefined>();
  const profile: ScoreSet = {
    id: "program-check",
    name: "Проверка программы",
    scores,
    individualAchievements: achievements,
    dviScore: dvi,
    updatedAt: new Date().toISOString(),
  };
  const match = matchProgram(program, profile);
  const completeness = calculateCompleteness(program);
  const distinctSubjects = [
    ...new Set(
      program.examRequirements.flatMap((requirement) => requirement.subjects),
    ),
  ];

  return (
    <div className="program-detail-page">
      <section className="program-hero container">
        <nav aria-label="Хлебные крошки">
          <Link href="/programs">Каталог</Link>
          <span>→</span>
          <span>{program.universityShort}</span>
        </nav>
        <div className="program-hero-grid">
          <div>
            <span className="overline">
              {program.universityShort} · {program.code}
            </span>
            <h1>{program.title}</h1>
            <p>{program.university}</p>
            <div className="program-identity">
              <span>{program.level}</span>
              <span>{program.form}</span>
              <span>{program.duration}</span>
              {program.campus && <span>{program.campus}</span>}
            </div>
          </div>
          <aside>
            <DataStatusBadge status={program.trust.status} />
            <CompletenessBadge
              percent={completeness.percent}
              missing={completeness.missing}
            />
            <SavedProgramActions id={program.id} />
          </aside>
        </div>
        {program.trust.status !== "verified" && (
          <div className="trust-warning" role="status">
            <b>Карточка неполная.</b> {program.trust.note} Непроверенные поля не
            используются в оценке.
          </div>
        )}
      </section>

      <div className="container decision-layout">
        <div className="decision-content">
          <section className="decision-section" id="fit">
            <header>
              <span>01</span>
              <div>
                <h2>Подхожу ли я?</h2>
                <p>
                  Сравнение с реальным итогом прошлой кампании — без обещания
                  поступления.
                </p>
              </div>
            </header>
            {distinctSubjects.length ? (
              <div className="inline-score-form">
                {distinctSubjects.map((subject) => (
                  <label key={subject}>
                    <span>{subject}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="0–100"
                      onChange={(event) =>
                        setScores((current) => ({
                          ...current,
                          [subject]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
                <label>
                  <span>Инд. достижения</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={achievements}
                    onChange={(event) =>
                      setAchievements(Number(event.target.value))
                    }
                  />
                </label>
                {program.dvi && (
                  <label>
                    <span>ДВИ</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={dvi ?? ""}
                      onChange={(event) =>
                        setDvi(
                          event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        )
                      }
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="partial-state">
                <b>Оценка пока недоступна</b>
                <p>
                  Официальный набор испытаний ещё не сопоставлен с программой.
                </p>
              </div>
            )}
            <div className={`fit-result fit-${match.category}`}>
              <span>Категория</span>
              <strong>
                {
                  {
                    high: "Высокий запас",
                    competitive: "Конкурентный вариант",
                    ambitious: "Амбициозный вариант",
                    insufficient: "Недостаточно данных",
                  }[match.category]
                }
              </strong>
              <p>
                {match.margin === null
                  ? match.missing.join("; ") || "Введите все необходимые баллы."
                  : `Учитываемая сумма ${match.consideredScore}; ${match.margin >= 0 ? "запас" : "дефицит"} ${Math.abs(match.margin)} баллов к проходному ${program.passingScoreValue.year} года.`}
              </p>
            </div>
            <HistoryChart
              title="Проходной балл общего конкурса"
              points={program.passingHistory}
              comparable={program.universitySlug !== "mgu"}
            />
          </section>

          {program.admissionsContact && (
            <section className="decision-section">
              <ProgramContacts contact={program.admissionsContact} />
            </section>
          )}
          <section className="decision-section" id="exams">
            <header>
              <span>02</span>
              <div>
                <h2>Что сдавать?</h2>
                <p>
                  Альтернативы объединены в один выбор; минимумы относятся к
                  кампании, указанной рядом.
                </p>
              </div>
            </header>
            {program.examRequirements.length ? (
              <div className="requirements-list">
                {program.examRequirements.map((requirement) => (
                  <ProgramRequirement
                    key={requirement.id}
                    requirement={requirement}
                  />
                ))}
              </div>
            ) : (
              <div className="partial-state">
                <b>Испытания ожидают сопоставления</b>
                <p>
                  До проверки официального перечня программа не участвует в
                  персональной оценке.
                </p>
              </div>
            )}
            <div className="metric-grid three">
              <SourcedMetric label="ДВИ" field={program.dviValue} />
              <SourcedMetric label="Максимум ДВИ" field={program.dviMax} />
              {program.dviMinimum && (
                <SourcedMetric label="Минимум ДВИ" field={program.dviMinimum} />
              )}
              <SourcedMetric
                label="Индивидуальные достижения"
                field={program.individualAchievementsMax}
                format={(value) => `до ${value} баллов`}
              />
            </div>
          </section>

          <section className="decision-section" id="cost">
            <header>
              <span>03</span>
              <div>
                <h2>Сколько стоит?</h2>
                <p>
                  Цена и места показаны только для того года, формы и программы,
                  которые удалось сопоставить.
                </p>
              </div>
            </header>
            <div className="metric-grid">
              <SourcedMetric
                label="Стоимость года"
                field={program.tuitionValue}
                format={formatPrice}
              />
              {program.durationValue && (
                <SourcedMetric
                  label="Срок обучения"
                  field={program.durationValue}
                />
              )}
              <SourcedMetric
                label="Бюджетные места"
                field={program.budgetPlacesValue}
              />
              <SourcedMetric
                label="Платные места"
                field={program.paidPlacesValue}
              />
            </div>
            <HistoryChart
              title="Стоимость обучения"
              points={program.tuitionHistory}
              unit=" ₽"
            />
            <HistoryChart
              title="Бюджетные места"
              points={program.placesHistory}
            />
          </section>

          <section className="decision-section" id="quotas">
            <header>
              <span>+</span>
              <div>
                <h2>Конкурсные группы и условия</h2>
                <p>Квоты не складываются автоматически с платными местами.</p>
              </div>
            </header>
            <div className="metric-grid">
              <SourcedMetric
                label="Общий конкурс"
                field={program.quotas.general}
              />
              <SourcedMetric
                label="Особая квота"
                field={program.quotas.special}
              />
              <SourcedMetric
                label="Отдельная квота"
                field={program.quotas.separate}
              />
              <SourcedMetric
                label="Целевой приём"
                field={program.quotas.target}
              />
              <SourcedMetric
                label="Общежитие"
                field={program.hostel}
                format={(value) => (value ? "Есть" : "Нет")}
              />
              <SourcedMetric
                label="Военный учебный центр"
                field={program.militaryCenter}
                format={(value) => (value ? "Есть" : "Нет")}
              />
            </div>
          </section>

          <section className="provenance-panel" id="sources">
            <h2>Откуда взяты данные</h2>
            <p>
              Источник привязан к каждому значению. Ниже — основной документ
              карточки.
            </p>
            <details open>
              <summary>
                {program.trust.sourceDocumentTitle ?? program.trust.sourceName}
              </summary>
              <dl>
                <div>
                  <dt>Официальный источник</dt>
                  <dd>
                    <a
                      href={program.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {program.trust.sourceName} ↗
                    </a>
                  </dd>
                </div>
                {program.trust.sourcePage && (
                  <div>
                    <dt>Страница</dt>
                    <dd>{program.trust.sourcePage}</dd>
                  </div>
                )}
                {program.trust.sourceSection && (
                  <div>
                    <dt>Раздел</dt>
                    <dd>{program.trust.sourceSection}</dd>
                  </div>
                )}
                <div>
                  <dt>Получено и проверено</dt>
                  <dd>
                    {new Intl.DateTimeFormat("ru-RU", {
                      dateStyle: "long",
                    }).format(new Date(program.trust.checkedAt))}
                  </dd>
                </div>
                <div>
                  <dt>Проверил</dt>
                  <dd>{program.trust.checkedBy}</dd>
                </div>
                <div>
                  <dt>Следующая проверка</dt>
                  <dd>
                    {program.trust.nextReviewAt
                      ? new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "long",
                        }).format(new Date(program.trust.nextReviewAt))
                      : "не назначена"}
                  </dd>
                </div>
              </dl>
            </details>
            <a
              className="report-link"
              href={`/support?program=${encodeURIComponent(program.slug)}`}
            >
              Сообщить об ошибке в данных
            </a>
          </section>
        </div>
        <aside className="decision-nav">
          <b>На этой странице</b>
          <a href="#fit">Подхожу ли я?</a>
          <a href="#exams">Что сдавать?</a>
          <a href="#cost">Сколько стоит?</a>
          <a href="#quotas">Квоты и условия</a>
          <a href="#sources">Источники</a>
        </aside>
      </div>
      <div className="mobile-action-bar">
        <SavedProgramActions id={program.id} />
        <a href={program.sourceUrl} target="_blank" rel="noreferrer">
          Официальный сайт ↗
        </a>
      </div>
    </div>
  );
}
