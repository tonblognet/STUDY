"use client";
import { useState } from "react";
import { accountRequest } from "@/lib/account/client";
export function LogoutButton({ all = false }: { all?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setLoading(true);
    setError("");
    try {
      await accountRequest(
        all ? "/api/auth/logout-all" : "/api/auth/logout",
        "POST",
      );
      // Full navigation clears sensitive client state after authentication changes.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch {
      setError("Не удалось завершить сессию. Повторите попытку");
      setLoading(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => void logout()}
        disabled={loading}
      >
        {loading ? "Завершаем…" : all ? "Выйти на всех устройствах" : "Выйти"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
