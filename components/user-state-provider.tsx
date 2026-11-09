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
import { setAccountIdentity } from "@/lib/account/client";
import {
  clearLocalUserState,
  readLocalUserState,
  writeLocalUserState,
} from "@/lib/admissions/storage";
import { mergeUserStates, userStatesEqual } from "@/lib/user-state/merge";
import { getUnimportedGuestState } from "@/lib/user-state/guest-import";
import { EMPTY_USER_STATE, type UserState } from "@/lib/user-state/types";

type StorageMode = "loading" | "local" | "account" | "unavailable";

type UserStateContextValue = UserState & {
  storageMode: StorageMode;
  syncing: boolean;
  error: string | null;
  hasGuestData: boolean;
  guestImportMessage: string | null;
  importGuestData(): void;
  discardGuestData(): void;
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
  accountId,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
  accountId?: string;
}) {
  const [state, setState] = useState<UserState>(EMPTY_USER_STATE);
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGuestData, setHasGuestData] = useState(false);
  const [guestImportMessage, setGuestImportMessage] = useState<string | null>(
    null,
  );
  const stateRef = useRef(state);
  const modeRef = useRef<StorageMode>("loading");
  const saveQueue = useRef(Promise.resolve());
  const versionRef = useRef(0);
  const blockedRef = useRef(false);
  const pendingRef = useRef(0);
  const importingRef = useRef<UserState | null>(null);

  const applyState = useCallback((next: UserState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    setAccountIdentity(accountId ?? null);
    let active = true;
    async function initialize() {
      await Promise.resolve();
      if (!active) return;
      const local = readLocalUserState();
      if (signedIn === false) {
        applyState(local);
        modeRef.current = "local";
        setStorageMode("local");
        return;
      }
      try {
        const response = await fetch("/api/user-state", {
          cache: "no-store",
          headers: { "x-account-id": accountId ?? "" },
        });
        if (!active) return;
        if (response.status === 401) {
          if (signedIn) throw new Error("Сессия истекла. Войдите снова");
          applyState(local);
          modeRef.current = "local";
          setStorageMode("local");
          return;
        }
        if (!response.ok)
          throw new Error("Серверное хранилище временно недоступно");
        const payload = (await response.json()) as {
          state: UserState;
          version: number;
        };
        versionRef.current = payload.version;
        if (!active) return;
        setHasGuestData(!userStatesEqual(local, EMPTY_USER_STATE));
        applyState(payload.state);
        modeRef.current = "account";
        setStorageMode("account");
      } catch (caught) {
        if (!active) return;
        modeRef.current = "unavailable";
        setStorageMode("unavailable");
        setError(
          caught instanceof Error ? caught.message : "Синхронизация недоступна",
        );
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [applyState, signedIn, accountId]);

  const persist = useCallback(
    (next: UserState) => {
      if (
        modeRef.current === "loading" ||
        modeRef.current === "unavailable" ||
        blockedRef.current
      )
        return;
      applyState(next);
      if (modeRef.current === "local") {
        writeLocalUserState(next);
        return;
      }

      setSyncing(true);
      pendingRef.current += 1;
      saveQueue.current = saveQueue.current
        .then(async () => {
          if (blockedRef.current) return;
          const sentState = stateRef.current;
          const importing = importingRef.current;
          const response = await fetch("/api/user-state", {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "x-account-id": accountId ?? "",
            },
            body: JSON.stringify({
              ...sentState,
              version: versionRef.current,
            }),
          });
          if (!response.ok)
            throw new Error(
              response.status === 409
                ? "Данные изменены в другой вкладке. Загрузите серверную версию перед продолжением"
                : "Не удалось сохранить изменения. Они остаются только в этой открытой вкладке",
            );
          const result = await response.json();
          versionRef.current = result.version;
          if (stateRef.current === sentState) applyState(result.state);
          if (importing) {
            try {
              const remaining = getUnimportedGuestState(
                importing,
                result.state,
              );
              setHasGuestData(
                !userStatesEqual(readLocalUserState(), EMPTY_USER_STATE),
              );
              setGuestImportMessage(
                userStatesEqual(remaining, EMPTY_USER_STATE)
                  ? "Гостевые данные сохранены в аккаунте. Локальная копия остаётся на устройстве; её можно удалить кнопкой ниже."
                  : "Некоторые гостевые данные не перенесены. Локальная копия сохранена целиком; проверьте доступность программ, лимиты списков и версии наборов перед удалением.",
              );
            } catch {
              setHasGuestData(true);
              setGuestImportMessage(
                "Данные сохранены в аккаунте. Локальная копия сохранена целиком; не удалось проверить завершение переноса.",
              );
            }
            importingRef.current = null;
          }
          setError(null);
        })
        .catch((caught) => {
          blockedRef.current = true;
          setError(
            caught instanceof Error ? caught.message : "Ошибка синхронизации",
          );
        })
        .finally(() => {
          pendingRef.current -= 1;
          setSyncing(pendingRef.current > 0);
        });
    },
    [applyState, accountId],
  );

  const value = useMemo<UserStateContextValue>(
    () => ({
      ...state,
      storageMode,
      syncing,
      error,
      hasGuestData,
      guestImportMessage,
      importGuestData() {
        if (
          modeRef.current !== "account" ||
          blockedRef.current ||
          pendingRef.current
        )
          return;
        const guest = readLocalUserState();
        importingRef.current = guest;
        setGuestImportMessage(null);
        persist(mergeUserStates(stateRef.current, guest));
      },
      discardGuestData() {
        clearLocalUserState();
        setHasGuestData(false);
        setGuestImportMessage(null);
      },
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
    [
      error,
      hasGuestData,
      guestImportMessage,
      persist,
      state,
      storageMode,
      syncing,
    ],
  );

  return (
    <UserStateContext.Provider value={value}>
      {error && (
        <div className="account-storage-status storage-warning" role="alert">
          Сохранение в аккаунт приостановлено: {error}.{" "}
          <a href="/account">Открыть кабинет</a>
        </div>
      )}
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
  const {
    storageMode,
    syncing,
    error,
    hasGuestData,
    guestImportMessage,
    importGuestData,
    discardGuestData,
  } = useUserState();
  if (storageMode === "loading")
    return (
      <div className="account-storage-status" role="status">
        Проверяем сохранённые данные…
      </div>
    );
  if (error)
    return (
      <div className="account-storage-status storage-warning" role="status">
        <b>Изменения не сохранены.</b> {error}.
        <button
          type="button"
          className="button button-secondary"
          onClick={() => window.location.reload()}
        >
          Загрузить серверную версию, отменив несохранённое
        </button>
      </div>
    );
  if (storageMode === "account")
    return (
      <div className="account-storage-status storage-synced" role="status">
        <b>{syncing ? "Сохраняем изменения…" : "Данные синхронизированы."}</b>{" "}
        Они доступны после входа на другом устройстве.
        {guestImportMessage && <p>{guestImportMessage}</p>}
        {hasGuestData && (
          <div>
            На устройстве есть гостевые программы и баллы. Переносите их только
            если это ваши данные.
            <button
              type="button"
              className="button button-secondary"
              disabled={syncing}
              onClick={importGuestData}
            >
              Перенести мои гостевые данные
            </button>
            <button
              type="button"
              className="text-link"
              disabled={syncing}
              onClick={discardGuestData}
            >
              Удалить гостевую копию
            </button>
          </div>
        )}
      </div>
    );
  return (
    <div className="account-storage-status" role="status">
      <b>Локальный режим.</b> Войдите, чтобы перенести баллы, избранное и
      сравнение в аккаунт.
    </div>
  );
}
