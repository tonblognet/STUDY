"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { accountRequest } from "@/lib/account/client";
import { LogoutButton } from "./logout-button";
export function AccountSecurity({ enabled }: { enabled: boolean }) {
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<
    Array<{ id: string; createdAt: string; expires: string }>
  >([]);
  useEffect(() => {
    void accountRequest("/api/account/security")
      .then((data) => setSessions(data.sessions))
      .catch(() => setError("Не удалось загрузить список сессий"));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await accountRequest("/api/account/security", "PATCH", {
          enabled: !enabled,
          challengeId: challenge,
          code: form.get("code"),
        });
        // Full navigation clears sensitive client state after authentication changes.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      } else {
        const data = await accountRequest("/api/account/security", "POST", {
          enabled: !enabled,
          password: form.get("password"),
        });
        setChallenge(data.challengeId);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось изменить настройки",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-settings">
      <h2>Безопасность</h2>
      <p>
        Двухэтапный вход по email {enabled ? "включён" : "выключен"}. Для
        изменения нужны пароль и код из письма. После подтверждения все сессии
        будут завершены.
      </p>
      <form className="account-controls" onSubmit={submit}>
        {challenge ? (
          <label key="code">
            Код подтверждения
            <input
              name="code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
        ) : (
          <label key="password">
            Текущий пароль
            <input
              name="password"
              required
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy
            ? "Подождите…"
            : challenge
              ? "Подтвердить изменение"
              : enabled
                ? "Выключить двухэтапный вход"
                : "Включить двухэтапный вход"}
        </button>
      </form>
      {challenge && (
        <div>
          <p role="status">Код отправлен на ваш email и действует 10 минут.</p>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              setChallenge("");
              setError("");
            }}
          >
            Запросить новый код
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <h3>Активные сессии: {sessions.length}</h3>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            Вход {s.createdAt.slice(0, 16).replace("T", " ")} UTC · до{" "}
            {s.expires.slice(0, 10)}
          </li>
        ))}
      </ul>
      <LogoutButton all />
    </div>
  );
}
type Notification = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
};
export function AccountNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await accountRequest("/api/account/notifications");
      setItems(data.items);
      setEnabled(data.enabled);
      setLoaded(true);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить уведомления",
      );
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 60000);
    const refresh = () => void load();
    window.addEventListener("postupai:tracker", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("postupai:tracker", refresh);
    };
  }, [load]);
  async function update(data: unknown) {
    setBusy(true);
    try {
      await accountRequest("/api/account/notifications", "PATCH", data);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить настройки",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-settings">
      <h2>Уведомления</h2>
      <p>
        Напоминания о личных сроках появляются здесь за 7 дней и после просрочки
        при открытии кабинета. Email-рассылка дедлайнов не подключена.
      </p>
      <label className="account-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!loaded || busy}
          onChange={(e) => void update({ enabled: e.target.checked })}
        />
        Напоминать о личных сроках в кабинете
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <button className="text-link" onClick={() => void load()}>
            Повторить
          </button>
        </p>
      )}
      {!loaded ? (
        <p role="status">Загружаем уведомления…</p>
      ) : !items.length ? (
        <p>Уведомлений пока нет</p>
      ) : (
        <ul className="account-notifications">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              {item.readAt ? (
                <span>Прочитано</span>
              ) : (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void update({ readId: item.id })}
                >
                  Отметить прочитанным
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
