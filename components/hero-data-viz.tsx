"use client";

import { useMemo, useState } from "react";

type Point = { label: string; value: number };

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
  const coordinates = useMemo(
    () =>
      points.map((point, index) => ({
        x: points.length === 1 ? 50 : 8 + (index / (points.length - 1)) * 84,
        y: 82 - (point.value / max) * 58,
      })),
    [max, points],
  );
  const polygon = `8,82 ${coordinates.map((point) => `${point.x},${point.y}`).join(" ")} ${coordinates.at(-1)?.x ?? 92},82`;

  function toggleSubject(subject: string) {
    setSelected((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject].slice(-3),
    );
  }

  return (
    <div className="hero-viz" aria-label="Обзор опубликованных бюджетных мест">
      <div className="viz-head">
        <div>
          <strong>Бюджетные места</strong>
          <span>в проверенной выборке</span>
        </div>
        <span className="viz-source">официальные источники</span>
      </div>
      <div className="chart-legend">
        <i /> опубликовано по программам
      </div>
      <svg
        className="hero-chart"
        viewBox="0 0 100 92"
        role="img"
        aria-label={points
          .map((point) => `${point.label}: ${point.value}`)
          .join(", ")}
      >
        {[24, 53, 82].map((y) => (
          <line key={y} x1="8" y1={y} x2="92" y2={y} />
        ))}
        <polygon points={polygon} />
        <polyline
          points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        {coordinates.map((point, index) => (
          <g
            key={points[index]?.label}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            tabIndex={0}
            role="button"
            aria-label={`${points[index]?.label}: ${points[index]?.value} мест`}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={active === index ? 2.2 : 1.4}
            />
          </g>
        ))}
      </svg>
      <div className="chart-axis">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
      <div className="chart-tooltip">
        <b>{points[active]?.value ?? 0}</b>
        <span>{points[active]?.label}</span>
      </div>
      <div className="subject-match">
        <div className="subject-title">
          <strong>Подходит по ЕГЭ</strong>
          <span>{selected.length} предмета выбрано</span>
        </div>
        <div className="subject-options">
          {subjects.slice(0, 4).map((subject) => (
            <button
              type="button"
              key={subject}
              className={selected.includes(subject) ? "selected" : ""}
              onClick={() => toggleSubject(subject)}
              aria-pressed={selected.includes(subject)}
            >
              <i />
              {subject}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
