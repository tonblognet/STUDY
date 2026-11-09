"use client";

import Link from "next/link";
import { useUserState } from "@/components/user-state-provider";
import type { Program } from "@/lib/data";

export function AccountSavedPrograms({ programs }: { programs: Program[] }) {
  const {
    favoriteIds,
    comparisonIds,
    toggleFavorite,
    removeFromComparison,
    storageMode,
    error,
  } = useUserState();
  const favorites = favoriteIds.map((id) => ({
    id,
    program: programs.find((program) => program.id === id),
  }));
  const comparison = comparisonIds.map((id) => ({
    id,
    program: programs.find((program) => program.id === id),
  }));
  const loading = storageMode === "loading";
  const unavailable = storageMode === "unavailable";
  const cannotChange = loading || unavailable || Boolean(error);

  return (
    <section className="account-saved" aria-labelledby="saved-programs-title">
      <header>
        <div>
          <span className="overline">Мой список</span>
          <h2 id="saved-programs-title">Сохранённые программы</h2>
        </div>
        <span className="storage-mode-label">
          {storageMode === "account"
            ? "В аккаунте"
            : storageMode === "local"
              ? "На устройстве"
              : unavailable
                ? "Хранилище недоступно"
                : "Загрузка…"}
        </span>
      </header>
      <div className="account-saved-grid">
        <article>
          <div className="account-saved-head">
            <h3>Избранное</h3>
            <b>{favorites.length}</b>
          </div>
          {loading ? (
            <p role="status">Загружаем избранное…</p>
          ) : unavailable ? (
            <p>
              Не удалось получить избранное. Повторите загрузку данных выше.
            </p>
          ) : favorites.length ? (
            <ul>
              {favorites.map(({ id, program }) => (
                <li key={id}>
                  <div>
                    {program ? (
                      <>
                        <Link href={`/programs/${program.slug}`}>
                          {program.title}
                        </Link>
                        <span>
                          {program.universityShort} · {program.code}
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>
                          Программа отсутствует в текущем каталоге
                        </strong>
                        <span>Сохранённый ключ: {id}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(id)}
                    disabled={cannotChange}
                    aria-label={`Удалить ${program?.title ?? id} из избранного`}
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Добавьте программы из каталога, чтобы быстро возвращаться к ним.
            </p>
          )}
          <Link className="text-link" href="/programs">
            Открыть каталог →
          </Link>
        </article>
        <article>
          <div className="account-saved-head">
            <h3>Сравнение</h3>
            <b>{comparison.length}</b>
          </div>
          {loading ? (
            <p role="status">Загружаем сравнение…</p>
          ) : unavailable ? (
            <p>
              Не удалось получить сравнение. Повторите загрузку данных выше.
            </p>
          ) : comparison.length ? (
            <ul>
              {comparison.map(({ id, program }) => (
                <li key={id}>
                  <div>
                    {program ? (
                      <>
                        <Link href={`/programs/${program.slug}`}>
                          {program.title}
                        </Link>
                        <span>
                          {program.universityShort} · {program.code}
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>
                          Программа отсутствует в текущем каталоге
                        </strong>
                        <span>Сохранённый ключ: {id}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromComparison(id)}
                    disabled={cannotChange}
                    aria-label={`Удалить ${program?.title ?? id} из сравнения`}
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Выберите две или больше программы, чтобы увидеть различия в одной
              таблице.
            </p>
          )}
          <Link className="text-link" href="/compare">
            Перейти к сравнению →
          </Link>
        </article>
      </div>
    </section>
  );
}
