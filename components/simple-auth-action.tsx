"use client";
import type { FormEvent } from "react";
import { useState } from "react";
import { accountRequest } from "@/lib/account/client";

function EmailActionForm({ resend = false }: { resend?: boolean }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const data = await accountRequest(
        resend ? "/api/auth/resend-verification" : "/api/auth/forgot-password",
        "POST",
        { email },
      );
      setStatus(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить письмо");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Email
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          maxLength={254}
        />
      </label>
      {status && (
        <p role="status" className="form-success">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={busy}>
        {busy
          ? "Отправляем…"
          : resend
            ? "Отправить подтверждение повторно"
            : "Отправить ссылку"}
      </button>
    </form>
  );
}
export function ForgotPasswordForm() {
  return <EmailActionForm />;
}
export function ResendVerificationForm() {
  return <EmailActionForm resend />;
}
export function ResetPasswordForm({ token }: { token: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setBusy(true);
    setStatus("");
    try {
      await accountRequest("/api/auth/reset-password", "POST", {
        token,
        password,
      });
      // Full navigation clears sensitive client state after authentication changes.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Не удалось изменить пароль");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Новый пароль
        <input
          required
          type="password"
          name="password"
          minLength={12}
          maxLength={72}
          autoComplete="new-password"
        />
        <small>
          Минимум 12 символов, заглавная и строчная буквы, цифра; не более 72
          байт.
        </small>
      </label>
      {status && (
        <p className="form-error" role="alert">
          {status}
        </p>
      )}
      <button className="button button-primary" disabled={busy}>
        {busy ? "Сохраняем…" : "Изменить пароль"}
      </button>
    </form>
  );
}
export function VerifyEmailAction({ token }: { token: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setBusy(true);
    setStatus("");
    try {
      await accountRequest("/api/auth/verify-email", "POST", {
        token,
        password,
      });
      setOk(true);
      setStatus("Email подтверждён. Теперь можно войти.");
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Не удалось подтвердить email",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {token && !ok && (
        <form className="auth-form" onSubmit={verify}>
          <label>
            Пароль аккаунта
            <input
              required
              type="password"
              name="password"
              minLength={12}
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Проверяем…" : "Подтвердить мой email"}
          </button>
        </form>
      )}
      {status && (
        <p
          className={ok ? "form-success" : "form-error"}
          role={ok ? "status" : "alert"}
        >
          {status}
        </p>
      )}
    </div>
  );
}
