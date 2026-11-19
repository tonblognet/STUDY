"use client";

import Link from "next/link";
import { useState } from "react";
import type { EducationTrack } from "@/lib/education-pathways";
import { homeEducationPaths } from "@/lib/home-content";
import styles from "@/app/home.module.css";

export function HomeLevelChooser() {
  const [selected, setSelected] = useState<EducationTrack>("master");
  const path = homeEducationPaths.find((item) => item.key === selected)!;
  return (
    <section
      id="education-levels"
      className={styles.levels}
      aria-labelledby="home-levels-title"
    >
      <div className="container">
        <div className={styles.sectionHeading}>
          <h2 id="home-levels-title">Куда пойдём дальше?</h2>
          <p>У каждого пути — свои условия поступления.</p>
        </div>
        <div className={styles.levelLayout}>
          <fieldset className={styles.levelOptions}>
            <legend className="sr-only">Выберите уровень образования</legend>
            {homeEducationPaths.map((item) => (
              <label
                className={styles.levelOption}
                data-selected={item.key === selected}
                key={item.key}
              >
                <input
                  type="radio"
                  name="home-education-level"
                  value={item.key}
                  checked={item.key === selected}
                  onChange={() => setSelected(item.key)}
                  aria-controls="home-level-panel"
                />
                <span className={styles.radioMark} aria-hidden="true" />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>
          <div
            className={styles.levelPanel}
            id="home-level-panel"
            aria-live="polite"
            aria-atomic="true"
          >
            <div key={path.key} className={styles.panelContent}>
              <p className={styles.panelLabel}>{path.label}</p>
              <h3>{path.headline}</h3>
              <p className={styles.panelDescription}>{path.description}</p>
              <ul className={styles.panelDetails}>
                {path.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <Link href={path.href} className={styles.primaryButton}>
                {path.action}
              </Link>
            </div>
          </div>
        </div>
        <p className={styles.coverageNote}>
          Подтверждённые условия есть не у всех программ. Всегда проверяйте год
          и источник.
        </p>
      </div>
    </section>
  );
}
