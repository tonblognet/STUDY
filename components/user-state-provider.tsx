"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ScoreSet } from "@/lib/admissions/types";
import {
  clearLocalUserState,
  readLocalUserState,
  writeLocalUserState,
} from "@/lib/admissions/storage";
import { mergeUserStates, userStatesEqual } from "@/lib/user-state/merge";
import { EMPTY_USER_STATE, type UserState } from "@/lib/user-state/types";

type StorageMode = "loading" | "local" | "account";

type UserStateContextValue = UserState & {
  storageMode: StorageMode;
  syncing: boolean;
  error: string | null;
  toggleFavorite(id: string): void;
  toggleComparison(id: string): void;
  removeFromComparison(id: string): void;
  saveScoreSet(profile: ScoreSet): void;
  removeScoreSet(id: string): void;
};

const UserStateContext = createContext<UserStateContextValue | null>(null);

export function UserStateProvider({
  children,
  signedIn,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  const [state, setState] = useState<UserState>(EMPTY_USER_STATE);
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const modeRef = useRef<StorageMode>("loading");
  const saveQueue = useRef(Promise.resolve());

  const applyState = useCallback((next: UserState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      await Promise.resolve();
      if (!active) return;
      const local = readLocalUserState();
      applyState(local);
      if (signedIn === false) {
        modeRef.current = "local";
        setStorageMode("local");
        return;
      }
      try {
        const response = await fetch("/api/user-state", { cache: "no-store" });
        if (!active) return;
        if (response.status === 401) {
          modeRef.current = "local";
          setStorageMode("local");
          return;
        }
        if (!response.ok)
          throw new Error("Серверное хранилище временно недоступно");
        const payload = (await response.json()) as { state: UserState };
        const merged = mergeUserStates(payload.state, local);
        if (!userStatesEqual(payload.state, merged)) {
          const saved = await fetch("/api/user-state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(merged),
          });
          if (!saved.ok)
            throw new Error("Не удалось перенести локальные данные в аккаунт");
        }
        if (!active) return;
        clearLocalUserState();
        applyState(merged);
        modeRef.current = "account";
        setStorageMode("account");
      } catch (caught) {
        if (!active) return;
        modeRef.current = "local";
        setStorageMode("local");
        setError(
          caught instanceof Error ? caught.message : "Синхронизация недоступна",
        );
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [applyState, signedIn]);

  const persist = useCallback(
    (next: UserState) => {
      applyState(next);
      if (modeRef.current !== "account") {
        writeLocalUserState(next);
        return;
      }

      setSyncing(true);
      saveQueue.current = saveQueue.current
        .then(async () => {
          const response = await fetch("/api/user-state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(stateRef.current),
          });
          if (!response.ok)
            throw new Error("Изменения пока сохранены только на устройстве");
          clearLocalUserState();
          setError(null);
        })
        .catch((caught) => {
          writeLocalUserState(stateRef.current);
          setError(
            caught instanceof Error ? caught.message : "Ошибка синхронизации",
          );
        })
        .finally(() => setSyncing(false));
    },
    [applyState],
  );

  const value = useMemo<UserStateContextValue>(
    () => ({
      ...state,
      storageMode,
      syncing,
      error,
      toggleFavorite(id) {
        const current = stateRef.current;
        persist({
          ...current,
          favoriteIds: current.favoriteIds.includes(id)
            ? current.favoriteIds.filter((item) => item !== id)
            : [...current.favoriteIds, id],
        });
      },
      toggleComparison(id) {
        const current = stateRef.current;
        persist({
          ...current,
          comparisonIds: current.comparisonIds.includes(id)
            ? current.comparisonIds.filter((item) => item !== id)
            : [...current.comparisonIds, id].slice(0, 20),
        });
      },
      removeFromComparison(id) {
        const current = stateRef.current;
        persist({
          ...current,
          comparisonIds: current.comparisonIds.filter((item) => item !== id),
        });
      },
      saveScoreSet(profile) {
        const current = stateRef.current;
        persist({
          ...current,
          scoreSets: [
            profile,
            ...current.scoreSets.filter((item) => item.id !== profile.id),
          ].slice(0, 8),
        });
      },
      removeScoreSet(id) {
        const current = stateRef.current;
        persist({
          ...current,
          scoreSets: current.scoreSets.filter((item) => item.id !== id),
        });
      },
    }),
    [error, persist, state, storageMode, syncing],
  );

  return (
    <UserStateContext.Provider value={value}>
      {children}
    </UserStateContext.Provider>
  );
}

export function useUserState() {
  const value = useContext(UserStateContext);
  if (!value)
    throw new Error("useUserState must be used inside UserStateProvider");
  return value;
}

export function UserStateStatus() {
  const { storageMode, syncing, error } = useUserState();
  if (storageMode === "loading")
    return (
      <div className="account-storage-status" role="status">
        Проверяем сохранённые данные…
      </div>
    );
  if (error)
    return (
      <div className="account-storage-status storage-warning" role="status">
        <b>Требуется повторная синхронизация.</b> {error}. Копия сохранена на
        этом устройстве.
      </div>
    );
  if (storageMode === "account")
    return (
      <div className="account-storage-status storage-synced" role="status">
        <b>{syncing ? "Сохраняем изменения…" : "Данные синхронизированы."}</b>{" "}
        Они доступны после входа на другом устройстве.
      </div>
    );
  return (
    <div className="account-storage-status" role="status">
      <b>Локальный режим.</b> Войдите, чтобы перенести баллы, избранное и
      сравнение в аккаунт.
    </div>
  );
}
