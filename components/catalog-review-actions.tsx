"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogReviewActions({
  revisionId,
  stale,
}: {
  revisionId: string;
  stale: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(decision: "publish" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/catalog/${revisionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "Не удалось сохранить решение");
        return;
      }
      setMessage(
        decision === "publish"
          ? "Версия опубликована. Откройте карточку программы для проверки."
          : "Изменение отклонено.",
      );
      router.refresh();
    } catch {
      setMessage(
        "Соединение прервалось. Обновите страницу, чтобы проверить, сохранено ли решение.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-review-form">
      {stale && (
        <p role="alert">
          Основа этого черновика устарела. Для публикации нужен новый импорт
          относительно текущей версии.
        </p>
      )}
      <label htmlFor="review-reason">Обоснование решения</label>
      <textarea
        id="review-reason"
        rows={3}
        minLength={10}
        maxLength={2000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <label className="catalog-review-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Я проверил изменения, источники, годы и отмеченные риски.
      </label>
      <div className="catalog-review-buttons">
        <button
          className="button button-primary"
          disabled={busy || stale || !confirmed || reason.trim().length < 10}
          onClick={() => submit("publish")}
        >
          Подтвердить публикацию
        </button>
        <button
          className="button button-secondary"
          disabled={busy || reason.trim().length < 10}
          onClick={() => submit("reject")}
        >
          Отклонить
        </button>
      </div>
      <p role="status" aria-live="polite">
        {busy ? "Сохраняем решение…" : message}
      </p>
    </div>
  );
}
