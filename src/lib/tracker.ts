// Promise statuses, shared by the public tracker and the admin.

export const PROMISE_STATUSES = [
  { id: "not_started", label: "Not started", color: "#E3E7EF", text: "#0F1E33" },
  { id: "in_progress", label: "In progress", color: "#FFF100", text: "#003979" },
  { id: "partly_kept", label: "Partly kept", color: "#F28C28", text: "#0F1E33" },
  { id: "kept", label: "Kept", color: "#1B8A4B", text: "#FFFFFF" },
  { id: "broken", label: "Broken", color: "#EF2023", text: "#FFFFFF" },
] as const;

export type PromiseStatus = (typeof PROMISE_STATUSES)[number]["id"];

export const STATUS_BY_ID = Object.fromEntries(PROMISE_STATUSES.map((s) => [s.id, s])) as Record<
  PromiseStatus,
  (typeof PROMISE_STATUSES)[number]
>;

export function countByStatus(statuses: PromiseStatus[]): Record<PromiseStatus, number> {
  const counts = Object.fromEntries(PROMISE_STATUSES.map((s) => [s.id, 0])) as Record<PromiseStatus, number>;
  for (const s of statuses) counts[s] += 1;
  return counts;
}
