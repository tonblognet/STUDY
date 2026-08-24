"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const endpoint = challengeId ? "/api/auth/two-factor" : `/api/auth/${mode}`;
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = challengeId ? { challengeId, code: form.code } : form;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(json.error ?? "Не удалось выполнить запрос");
      return;
    }
    if (json.requiresTwoFactor) {
      setChallengeId(json.challengeId);
      setMessage("Отправили шестизначный код на email.");
      return;
    }
    if (mode === "register") {
      setMessage(json.message ?? "Проверьте почту и подтвердите адрес.");
      return;
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {challengeId ? (
        <label>
          Код из письма
          <input
            required
            inputMode="numeric"
            name="code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
          />
        </label>
      ) : (
        <>
          <label>
            Электронная почта
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.ru"
            />
          </label>
          {mode === "register" && (
            <label>
              Как вас зовут
              <input
                required
                name="name"
                autoComplete="name"
                minLength={2}
                maxLength={80}
              />
            </label>
          )}
          <label>
            Пароль
            <input
              required
              type="password"
              name="password"
              minLength={12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            <small>
              Минимум 12 символов, заглавная и строчная буквы, цифра
            </small>
          </label>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      <button className="button button-primary" disabled={loading}>
        {loading
          ? "Подождите…"
          : challengeId
            ? "Подтвердить вход"
            : mode === "login"
              ? "Войти"
              : "Создать аккаунт"}
      </button>
    </form>
  );
}
