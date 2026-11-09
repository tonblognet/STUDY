"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Program } from "@/lib/data";
import { trackerStages, type TrackerItem } from "@/lib/account/tracker";
import { useUserState } from "@/components/user-state-provider";
import { accountRequest } from "@/lib/account/client";
import { LegacyTrackerImport } from "@/components/legacy-tracker-import";
import { resolveTrackerProgramKey } from "@/lib/account/tracker-program";
import {
  applyTrackerChange,
  commitTrackerChange,
  type TrackerMutationMethod,
} from "@/lib/account/tracker-client";

export function AdmissionTracker({ programs }: { programs: Program[] }) {
  const { favoriteIds } = useUserState();
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await accountRequest("/api/tracker");
      setItems(data.items);
      setLoaded(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить трекер");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function mutate(method: TrackerMutationMethod, data: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const change = await commitTrackerChange(method, data);
      setItems((current) => applyTrackerChange(current, change));
      setMessage("Трекер сохранён в аккаунте");
      window.dispatchEvent(new Event("postupai:tracker"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить трекер");
    } finally {
      setBusy(false);
    }
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate("POST", {
      programKey: data.get("programKey"),
      admissionYear: Number(data.get("year")),
    });
  }
  return (
    <div className="admission-tracker">
      <LegacyTrackerImport onImported={load} />
      <p className="tracker-privacy-note">
        Этапы, заметки и личные сроки хранятся в аккаунте. Отметки не отправляют
        документы в вуз. Официальные конкурсные позиции не подключены.
      </p>
      <form className="account-controls" onSubmit={add}>
        <label>
          Программа
          <select name="programKey" required defaultValue="">
            <option value="" disabled>
              Выберите программу
            </option>
            {[...programs]
              .sort(
                (a, b) =>
                  Number(favoriteIds.includes(b.id)) -
                  Number(favoriteIds.includes(a.id)),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {favoriteIds.includes(p.id) ? "★ " : ""}
                  {p.universityShort} · {p.title} · {p.code} · {p.faculty ?? ""}{" "}
                  · {p.form}
                </option>
              ))}
          </select>
        </label>
        <label>
          Год поступления
          <input
            name="year"
            type="number"
            min={2026}
            max={2100}
            defaultValue={2027}
            required
          />
        </label>
        <button
          className="button button-primary"
          disabled={busy || loading || !loaded}
        >
          Добавить в трекер
        </button>
      </form>
      {error && (
        <div role="alert" className="form-error">
          {error}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => void load()}
          >
            Обновить список
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {loading ? (
        <p role="status">Загружаем трекер…</p>
      ) : !loaded ? (
        <p>Список трекера не загружен. Повторите загрузку выше.</p>
      ) : !items.length ? (
        <div className="tracker-empty">
          <strong>Маршрут ещё не собран</strong>
          <p>
            Выберите программу и год выше. Избранные программы отмечены звездой.
          </p>
        </div>
      ) : (
        <div className="account-tracker-list">
          {items.map((item) => (
            <TrackerRow
              key={`${item.id}:${item.version}`}
              item={item}
              program={resolveTrackerProgramKey(item.programKey, programs)}
              busy={busy}
              save={(data) => void mutate("PATCH", data)}
              remove={() =>
                void mutate("DELETE", { id: item.id, version: item.version })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
function TrackerRow({
  item,
  program,
  busy,
  save,
  remove,
}: {
  item: TrackerItem;
  program?: Program;
  busy: boolean;
  save: (data: unknown) => void;
  remove: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("deadline") ?? "");
    save({
      id: item.id,
      version: item.version,
      priority: Number(form.get("priority")),
      stage: form.get("stage"),
      documentsReady: form.has("documents"),
      consentReady: form.has("consent"),
      deadlineAt: date ? `${date}T12:00:00.000Z` : null,
      notes: form.get("notes"),
    });
  }
  return (
    <article className="account-tracker-card">
      <h3>
        {program ? (
          <Link href={`/programs/${program.slug}`}>
            {program.universityShort} · {program.title}
          </Link>
        ) : (
          item.programKey
        )}
      </h3>
      <p>
        {item.admissionYear} ·{" "}
        {program
          ? [program.code, program.faculty, program.form]
              .filter(Boolean)
              .join(" · ")
          : "Программа сейчас отсутствует в публичном каталоге"}
      </p>
      <form className="account-controls" onSubmit={submit}>
        <label>
          Приоритет
          <input
            name="priority"
            type="number"
            min={1}
            max={200}
            defaultValue={item.priority}
            required
          />
        </label>
        <label>
          Этап
          <select name="stage" defaultValue={item.stage}>
            {trackerStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Личный срок
          <input
            name="deadline"
            type="date"
            defaultValue={item.deadlineAt?.slice(0, 10) ?? ""}
            min="2026-01-01"
            max="2100-12-31"
          />
          <small>Задан вами, не официальный дедлайн</small>
        </label>
        <label className="account-check">
          <input
            name="documents"
            type="checkbox"
            defaultChecked={item.documentsReady}
          />
          Документы готовы
        </label>
        <label className="account-check">
          <input
            name="consent"
            type="checkbox"
            defaultChecked={item.consentReady}
          />
          Согласие проверено
        </label>
        <label className="account-notes">
          Личная заметка
          <textarea
            name="notes"
            maxLength={2000}
            rows={2}
            defaultValue={item.notes}
          />
        </label>
        <button className="button button-primary" disabled={busy}>
          Сохранить запись
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={remove}
        >
          Удалить из трекера
        </button>
      </form>
      <details>
        <summary>История изменений ({item.history.length})</summary>
        <ul>
          {[...item.history].reverse().map((entry, i) => (
            <li key={i}>
              {entry.at.slice(0, 16).replace("T", " ")} UTC ·{" "}
              {entry.action.replace(
                /«(shortlist|documents|submitted|ranked|enrolled|withdrawn)»/g,
                (_, id) =>
                  `«${trackerStages.find((stage) => stage.id === id)?.label ?? id}»`,
              )}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
