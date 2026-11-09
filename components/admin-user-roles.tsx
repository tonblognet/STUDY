"use client";
import { useState, type FormEvent } from "react";
import {
  canChangeUserRole,
  staffRoles,
  type StaffRole,
} from "@/lib/admin/user-policy";
import type { AdminUserList, AdminUserView } from "@/lib/admin/users";
import styles from "./admin-user-roles.module.css";

const labels: Record<StaffRole, string> = {
  USER: "Пользователь",
  SUPPORT: "Поддержка",
  CONTENT_MANAGER: "Редактор",
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

export function AdminUserRoles({
  actorId,
  actorRole,
  initial,
  roleFilter,
}: {
  actorId: string;
  actorRole: StaffRole;
  initial: AdminUserList;
  roleFilter?: StaffRole;
}) {
  const [items, setItems] = useState(initial.items);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function call(path: string, method = "GET", body?: unknown) {
    const response = await fetch(path, {
      method,
      cache: "no-store",
      headers: { "content-type": "application/json", "x-account-id": actorId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Не удалось выполнить запрос");
    return data;
  }
  async function reload() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const query = new URLSearchParams({
        page: String(initial.page),
        ...(roleFilter ? { role: roleFilter } : {}),
      });
      const data = (await call(`/api/admin/users?${query}`)) as AdminUserList;
      setItems(data.items);
      setMessage("Список обновлён");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить список");
    } finally {
      setBusy(false);
    }
  }
  async function change(target: AdminUserView, role: StaffRole) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await call(`/api/admin/users/${target.id}`, "PATCH", {
        role,
        authVersion: target.authVersion,
      });
      setItems((current) =>
        current.map((item) => (item.id === target.id ? result.item : item)),
      );
      setMessage(
        result.changed
          ? "Роль изменена. Сеансы и незавершённые подтверждения аккаунта отозваны."
          : "Роль уже установлена",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить роль");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Роли аккаунтов" className={styles.list}>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => void reload()}
      >
        Обновить список
      </button>
      {busy && <p role="status">Сохраняем изменения…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!items.length && <p>Аккаунты с выбранной ролью не найдены.</p>}
      {items.map((target) => (
        <RoleRow
          key={`${target.id}:${target.authVersion}`}
          target={target}
          actorId={actorId}
          actorRole={actorRole}
          busy={busy}
          change={change}
        />
      ))}
    </section>
  );
}

function RoleRow({
  target,
  actorId,
  actorRole,
  busy,
  change,
}: {
  target: AdminUserView;
  actorId: string;
  actorRole: StaffRole;
  busy: boolean;
  change: (target: AdminUserView, role: StaffRole) => Promise<void>;
}) {
  const [next, setNext] = useState(target.role);
  const self = actorId === target.id;
  const options = staffRoles.filter((role) =>
    canChangeUserRole(actorRole, target.role, role, self),
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    void change(target, next);
  }
  return (
    <article className={styles.card}>
      <h2 className={styles.identifier}>
        Аккаунт <code>{target.id}</code>
      </h2>
      <p>Текущая роль: {labels[target.role]}</p>
      {self ? (
        <p>Это ваш аккаунт. Смена собственной роли недоступна.</p>
      ) : !options.length ? (
        <p>Эта роль доступна для управления только суперадминистратору.</p>
      ) : (
        <form className="account-controls" onSubmit={submit}>
          <label>
            Новая роль
            <select
              value={next}
              onChange={(event) => setNext(event.target.value as StaffRole)}
              disabled={busy}
            >
              {options.map((role) => (
                <option value={role} key={role}>
                  {labels[role]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy || next === target.role}
          >
            Сохранить роль
          </button>
        </form>
      )}
    </article>
  );
}
