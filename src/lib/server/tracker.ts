import "server-only";
import { connection } from "next/server";
import { readOrNull } from "@/lib/starbase";
import type { PromiseStatus } from "@/lib/tracker";
import type { PublicPromise, TrackerSource } from "@/components/tracker/PromiseList";

type Raw = {
  promises: {
    number: number; title: string; specifics: string; area: string; sources: TrackerSource[]; status: PromiseStatus;
    status_changed_at: string | null; test: { kept: string | null; partly: string | null; broken: string | null; record: string | null };
    updates: { date: string; status: PromiseStatus | null; note: string; url: string | null }[];
  }[];
  announcements: { date: string; date_label: string; title: string; commitments: string; sources: TrackerSource[] }[];
  counts: Record<PromiseStatus, number>;
  total: number;
};

export type Announcement = { id: string; dateLabel: string; title: string; commitments: string; sources: TrackerSource[] };

/** The tracker as Starbase keeps it (Website → Promise tracker). */
export async function loadTracker(): Promise<{ promises: PublicPromise[]; announcements: Announcement[]; lastUpdated: string | null }> {
  await connection();
  const raw = await readOrNull<Raw>("/site/tracker");
  const promises: PublicPromise[] = (raw?.promises ?? []).map((p) => ({
    id: String(p.number),
    number: p.number,
    title: p.title,
    specifics: p.specifics,
    area: p.area,
    status: p.status,
    sources: p.sources,
    testKept: p.test.kept,
    testPartly: p.test.partly,
    testBroken: p.test.broken,
    testRecord: p.test.record,
    updates: p.updates.map((u, i) => ({ id: `${p.number}-${i}`, date: u.date, status: u.status, note: u.note, url: u.url })),
  }));
  const announcements: Announcement[] = (raw?.announcements ?? []).map((a, i) => ({
    id: `${a.date}-${i}`, dateLabel: a.date_label || a.date, title: a.title, commitments: a.commitments, sources: a.sources,
  }));
  const dates = promises.flatMap((p) => p.updates.map((u) => u.date));
  const lastUpdated = dates.length ? dates.sort().at(-1)! : null;
  return { promises, announcements, lastUpdated };
}

/** Today's date in Surrey, as YYYY-MM-DD. */
export function todayInSurrey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
}
