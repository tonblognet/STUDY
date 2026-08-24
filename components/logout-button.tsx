"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ all = false }: { all?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    await fetch(all ? "/api/auth/logout-all" : "/api/auth/logout", {
      method: "POST",
    });
    router.push("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={logout}
      disabled={loading}
    >
      {loading ? "Завершаем…" : all ? "Выйти на всех устройствах" : "Выйти"}
    </button>
  );
}
