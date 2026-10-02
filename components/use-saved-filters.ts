"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { z } from "zod";
import { decodeView, viewFromSearch } from "@/lib/catalog/view-state";

const memory = new Map<string, string>();
const eventName = "postupai:filters";
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key) memory.delete(event.key);
    else memory.clear();
    callback();
  };
  window.addEventListener(eventName, callback);
  window.addEventListener("popstate", callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Public filters only: exam results and personal profiles never enter the URL. */
export function useSavedFilters<T>(
  route: string,
  schema: z.ZodType<T>,
  initialQuery = "",
  initialView?: string,
) {
  const key = `postupai:filters:v1:${route}`;
  const server = initialView ?? JSON.stringify({ query: initialQuery });
  const read = useCallback(() => {
    if (window.location.pathname === route) {
      const explicit = viewFromSearch(window.location.search);
      if (explicit !== null) return explicit;
    }
    try {
      return memory.get(key) ?? localStorage.getItem(key) ?? server;
    } catch {
      return memory.get(key) ?? server;
    }
  }, [key, route, server]);
  const raw = useSyncExternalStore(subscribe, read, () => server);
  const value = useMemo(() => decodeView(schema, raw), [schema, raw]);
  useEffect(() => {
    if (window.location.pathname !== route || read() !== raw) return;
    const serialized = JSON.stringify(value);
    memory.set(key, serialized);
    try {
      localStorage.setItem(key, serialized);
    } catch {
      /* Retain the in-memory fallback. */
    }
  }, [key, route, value, read, raw]);
  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = decodeView(schema, read());
      const validated = schema.parse(
        typeof next === "function"
          ? (next as (current: T) => T)(current)
          : next,
      );
      const serialized = JSON.stringify(validated);
      memory.set(key, serialized);
      try {
        localStorage.setItem(key, serialized);
      } catch {
        /* URL and memory still work. */
      }
      if (window.location.pathname === route) {
        const url = new URL(window.location.href);
        url.searchParams.delete("q");
        url.searchParams.set("filters", serialized);
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      window.dispatchEvent(new Event(eventName));
    },
    [key, read, route, schema],
  );
  return [value, setValue] as const;
}
