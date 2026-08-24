"use client";
import type { FormEvent } from "react";
import { useState } from "react";

export function SupportTicketForm() {
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Отправляем…");
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (response.ok) {
      event.currentTarget.reset();
      setStatus("Обращение создано. История доступна в кабинете.");
    } else setStatus(json.error ?? "Не удалось создать обращение");
  }
  return (
    <form className="auth-form support-form" onSubmit={submit}>
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
      {status && (
        <p role="status" className="form-success">
          {status}
        </p>
      )}
      <button className="button button-primary">Создать обращение</button>
    </form>
  );
}
