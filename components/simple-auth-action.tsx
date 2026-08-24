"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await response.json().catch(() => ({}));
    setStatus(json.message ?? json.error ?? "Проверьте почту");
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Email
        <input required type="email" name="email" autoComplete="email" />
      </label>
      {status && (
        <p className="form-success" role="status">
          {status}
        </p>
      )}
      <button className="button button-primary">Отправить ссылку</button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(json.error ?? "Не удалось изменить пароль");
      return;
    }
    router.push("/login");
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
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      {status && (
        <p className="form-error" role="alert">
          {status}
        </p>
      )}
      <button className="button button-primary">Изменить пароль</button>
    </form>
  );
}

export function VerifyEmailAction({ token }: { token: string }) {
  const [status, setStatus] = useState("Проверяем ссылку…");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const json = await response.json().catch(() => ({}));
      setOk(response.ok);
      setStatus(
        response.ok
          ? "Email подтверждён. Теперь можно войти."
          : (json.error ?? "Ссылка недействительна"),
      );
    });
  }, [token]);
  return (
    <p className={ok ? "form-success" : "auth-note"} role="status">
      {status}
    </p>
  );
}
