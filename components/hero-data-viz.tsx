"use client";

import { useState } from "react";
import styles from "@/app/home.module.css";

type Point = { id: string; label: string; title: string; value: number };

export function HeroDataViz({
  points,
  subjects,
}: {
  points: Point[];
  subjects: string[];
}) {
  const [active, setActive] = useState(Math.max(0, points.length - 1));
  const [selected, setSelected] = useState(() => subjects.slice(0, 3));
  const max = Math.max(...points.map((point) => point.value), 1);
  const currentPoint = points[active];

  function toggleSubject(subject: string) {
    setSelected((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject].slice(-3),
    );
  }

  return (
    <section className={styles.preview} aria-labelledby="budget-preview">
      <div className={styles.previewHead}>
        <h2 id="budget-preview">Бюджетные места</h2>
        <p>Примеры программ из каталога</p>
      </div>
      {currentPoint ? (
        <>
          <div
            className={styles.chart}
            role="group"
            aria-label="Бюджетные места по программам"
          >
            {points.map((point, index) => (
              <button
                key={point.id}
                type="button"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => setActive(index)}
                aria-pressed={active === index}
                aria-label={`${point.label}, ${point.title}. Бюджетные места: ${point.value}`}
              >
                <span className={styles.barTrack} aria-hidden="true">
                  <span style={{ height: `${(point.value / max) * 100}%` }} />
                </span>
                <span className={styles.barLabel}>{point.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.programReading}>
            <div>
              <strong>{currentPoint.title}</strong>
              <span>{currentPoint.label}</span>
            </div>
            <span>
              <b>{currentPoint.value}</b> мест
            </span>
          </div>
        </>
      ) : (
        <p className={styles.noBudget}>
          В этой выборке пока нет опубликованных данных о местах.
        </p>
      )}
      <div className={styles.subjects}>
        <div className={styles.subjectTitle}>
          <strong>Пример набора ЕГЭ</strong>
          <span>Выбрано {selected.length} из 3</span>
        </div>
        <div
          className={styles.subjectOptions}
          role="group"
          aria-label="Предметы для примера"
        >
          {subjects.slice(0, 4).map((subject) => (
            <button
              type="button"
              key={subject}
              onClick={() => toggleSubject(subject)}
              aria-pressed={selected.includes(subject)}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
