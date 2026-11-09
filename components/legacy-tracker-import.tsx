"use client";
import { useEffect, useState, type FormEvent } from "react";
import { legacyTrackerSchema } from "@/lib/account/legacy-tracker";
import { accountRequest } from "@/lib/account/client";
const key = "postupai:admission-tracker";
export function LegacyTrackerImport({
  onImported,
}: {
  onImported: () => Promise<void>;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem(key);
        if (
          stored &&
          stored.length < 128000 &&
          legacyTrackerSchema.parse(JSON.parse(stored)).length
        )
          setRaw(stored);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await accountRequest("/api/tracker/import", "POST", {
        items: JSON.parse(raw),
        admissionYear: Number(data.get("year")),
        confirmedOwner: data.has("owner"),
      });
      setMessage(
        "Перенос завершён. Существующие записи аккаунта сохранены. Локальная копия остаётся на устройстве; удалить её можно кнопкой ниже.",
      );
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось перенести маршрут");
    } finally {
      setBusy(false);
    }
  }
  function discardLocalCopy() {
    setError("");
    try {
      localStorage.removeItem(key);
      setRaw("");
    } catch {
      setError("Не удалось удалить локальную копию маршрута");
    }
  }
  if (!raw) return null;
  return (
    <div className="account-tracker-card">
      <h3>Найден старый маршрут на этом устройстве</h3>
      <p>
        У локальной копии нет владельца. Перенесите её только если это ваши
        записи. Существующие серверные записи сохранятся без изменений.
      </p>
      <form className="account-controls" onSubmit={submit}>
        <label>
          Год локального маршрута
          <input
            type="number"
            name="year"
            required
            min={2026}
            max={2100}
            defaultValue={2027}
          />
        </label>
        <label className="account-check">
          <input type="checkbox" name="owner" required />
          Это мои данные
        </label>
        <button className="button button-secondary" disabled={busy}>
          Перенести старый маршрут
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={discardLocalCopy}
      >
        Удалить локальную копию маршрута
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
