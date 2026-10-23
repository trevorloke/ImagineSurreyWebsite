const TZ = "America/Vancouver";

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" });
}

export function formatEventTime(d: Date): string {
  return d.toLocaleString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function dayAndMonth(d: Date): { day: string; mon: string } {
  return {
    day: d.toLocaleDateString("en-CA", { timeZone: TZ, day: "numeric" }),
    mon: d.toLocaleDateString("en-CA", { timeZone: TZ, month: "short" }).replace(".", ""),
  };
}

export function timeOnly(d: Date): string {
  return d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}
