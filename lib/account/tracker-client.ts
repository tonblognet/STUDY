import { accountRequest } from "./client";
import type { TrackerItem } from "./tracker";

export type TrackerMutationMethod = "POST" | "PATCH" | "DELETE";
type TrackerChange =
  | { type: "save"; item: TrackerItem }
  | { type: "remove"; id: string };

/** The acknowledged response already carries the current optimistic version. */
export async function commitTrackerChange(
  method: TrackerMutationMethod,
  data: unknown,
): Promise<TrackerChange> {
  const result = await accountRequest("/api/tracker", method, data);
  if (method === "DELETE")
    return { type: "remove", id: (data as { id: string }).id };
  if (!result.item)
    throw new Error("Сервер не подтвердил запись. Обновите список трекера");
  return { type: "save", item: result.item as TrackerItem };
}

export function applyTrackerChange(
  items: TrackerItem[],
  change: TrackerChange,
): TrackerItem[] {
  if (change.type === "remove")
    return items.filter((item) => item.id !== change.id);
  const existing = items.some((item) => item.id === change.item.id);
  return (
    existing
      ? items.map((item) => (item.id === change.item.id ? change.item : item))
      : [...items, change.item]
  ).sort((a, b) => a.priority - b.priority);
}
