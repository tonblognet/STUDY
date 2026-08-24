"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUserState } from "@/components/user-state-provider";
import type { Program } from "@/lib/data";

type TrackerStage =
  | "shortlist"
  | "documents"
  | "submitted"
  | "ranked"
  | "enrolled";
type TrackerItem = {
  programId: string;
  priority: number;
  stage: TrackerStage;
  documentsReady: boolean;
  consentReady: boolean;
};

const stages: Array<{ id: TrackerStage; label: string }> = [
  { id: "shortlist", label: "Выбираю" },
  { id: "documents", label: "Готовлю документы" },
  { id: "submitted", label: "Заявление подано" },
  { id: "ranked", label: "Слежу за конкурсом" },
  { id: "enrolled", label: "Зачислен" },
];

const key = "postupai:admission-tracker";

function readTracker(): TrackerItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function AdmissionTracker({ programs }: { programs: Program[] }) {
  const { favoriteIds } = useUserState();
  const [storedItems, setStoredItems] = useState<TrackerItem[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setStoredItems(readTracker()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const items = useMemo(() => {
    const known = new Map(storedItems.map((item) => [item.programId, item]));
    return favoriteIds.map(
      (programId, index): TrackerItem =>
        known.get(programId) ?? {
          programId,
          priority: index + 1,
          stage: "shortlist",
          documentsReady: false,
          consentReady: false,
        },
    );
  }, [favoriteIds, storedItems]);

  const rows = useMemo(
    () =>
      items
        .map((item) => ({
          item,
          program: programs.find((program) => program.id === item.programId),
        }))
        .filter((row): row is { item: TrackerItem; program: Program } =>
          Boolean(row.program),
        )
        .sort((left, right) => left.item.priority - right.item.priority),
    [items, programs],
  );

  function update(programId: string, patch: Partial<TrackerItem>) {
    const next = items.map((item) =>
      item.programId === programId ? { ...item, ...patch } : item,
    );
    setStoredItems(next);
    window.localStorage.setItem(key, JSON.stringify(next));
  }

  if (!rows.length)
    return (
      <div className="tracker-empty">
        <strong>Маршрут ещё не собран</strong>
        <p>
          Добавьте программы в избранное — они автоматически появятся здесь.
        </p>
        <Link href="/programs" className="button button-primary">
          Выбрать программы
        </Link>
      </div>
    );

  const completed = rows.filter(({ item }) => item.stage === "enrolled").length;
  return (
    <div className="admission-tracker">
      <div className="tracker-progress">
        <div>
          <span>В маршруте</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Заявления поданы</span>
          <strong>
            {
              rows.filter(({ item }) =>
                ["submitted", "ranked", "enrolled"].includes(item.stage),
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Зачисление</span>
          <strong>{completed}</strong>
        </div>
      </div>
      <div className="tracker-list">
        {rows.map(({ item, program }) => (
          <article key={program.id}>
            <label className="tracker-priority">
              Приоритет
              <input
                type="number"
                min="1"
                max={rows.length}
                value={item.priority}
                onChange={(event) =>
                  update(program.id, {
                    priority: Number(event.target.value) || 1,
                  })
                }
              />
            </label>
            <div className="tracker-program">
              <Link href={`/programs/${program.slug}`}>{program.title}</Link>
              <span>
                {program.universityShort} · {program.code}
              </span>
            </div>
            <label className="tracker-stage">
              Этап
              <select
                value={item.stage}
                onChange={(event) =>
                  update(program.id, {
                    stage: event.target.value as TrackerStage,
                  })
                }
              >
                {stages.map((stage) => (
                  <option value={stage.id} key={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="tracker-checks">
              <label>
                <input
                  type="checkbox"
                  checked={item.documentsReady}
                  onChange={(event) =>
                    update(program.id, { documentsReady: event.target.checked })
                  }
                />
                Документы
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={item.consentReady}
                  onChange={(event) =>
                    update(program.id, { consentReady: event.target.checked })
                  }
                />
                Согласие
              </label>
            </div>
          </article>
        ))}
      </div>
      <p className="tracker-privacy-note">
        Статусы маршрута хранятся на этом устройстве. Конкурсные позиции не
        загружаются без подключения официального источника.
      </p>
    </div>
  );
}
