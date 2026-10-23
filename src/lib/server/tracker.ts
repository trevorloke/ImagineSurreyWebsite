import "server-only";
import { asc, desc } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { trackerAnnouncements, trackerPromises, trackerUpdates } from "@/lib/db/schema";

export async function loadTracker() {
  await connection();
  const db = getDb();
  const [promises, updates, announcements] = await Promise.all([
    db.select().from(trackerPromises).orderBy(asc(trackerPromises.number)),
    db.select().from(trackerUpdates).orderBy(desc(trackerUpdates.date), desc(trackerUpdates.createdAt)),
    db.select().from(trackerAnnouncements).orderBy(desc(trackerAnnouncements.date), desc(trackerAnnouncements.createdAt)),
  ]);
  const updatesByPromise = new Map<string, typeof updates>();
  for (const u of updates) updatesByPromise.set(u.promiseId, [...(updatesByPromise.get(u.promiseId) ?? []), u]);
  return {
    promises: promises.map((p) => ({ ...p, updates: updatesByPromise.get(p.id) ?? [] })),
    announcements,
    lastUpdated: updates[0]?.date ?? null,
  };
}

export type TrackerData = Awaited<ReturnType<typeof loadTracker>>;
export type TrackerPromiseWithUpdates = TrackerData["promises"][number];
