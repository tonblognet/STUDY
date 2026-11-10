"use client";
import type { FormEvent } from "react";
import { useState } from "react";
import { accountRequest } from "@/lib/account/client";
import styles from "./support.module.css";

export function SupportTicketForm({
  onCreated,
}: {
  onCreated?: (id: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    setStatus("");
    setError("");
    setBusy(true);
    try {
      const json = await accountRequest(
        "/api/support/tickets",
        "POST",
        payload,
      );
      form.reset();
      setStatus("Обращение создано. Переписка доступна в истории ниже.");
      onCreated?.(json.ticket.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось создать обращение",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`auth-form support-form ${styles.createForm}`}
      onSubmit={submit}
      aria-busy={busy}
    >
      <fieldset
        disabled={busy}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 16,
          minWidth: 0,
        }}
      >
        <label>
          Тема
          <input name="subject" required minLength={5} maxLength={140} />
        </label>
        <label>
          Категория
          <select name="category">
            <option value="DATA">Ошибка в данных</option>
            <option value="AUTH">Вход и аккаунт</option>
            <option value="PAYMENT">Оплата</option>
            <option value="OTHER">Другое</option>
          </select>
        </label>
        <label>
          Сообщение
          <textarea
            name="message"
            required
            minLength={20}
            maxLength={5000}
            rows={6}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="form-success">
          {status}
        </p>
      )}
      <button className="button button-primary" disabled={busy}>
        {busy ? "Отправляем…" : "Создать обращение"}
      </button>
    </form>
  );
}
