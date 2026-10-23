"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { trackerAnnouncements, trackerPromises, trackerUpdates } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/server/admin-auth";
import { ISO_DATE_RE } from "@/lib/shifts";
import { PROMISE_STATUSES } from "@/lib/tracker";

const statusIds = PROMISE_STATUSES.map((s) => s.id) as [string, ...string[]];
const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Links must start with http:// or https://")
  .transform((v) => v || null);
const isoDate = z.string().regex(ISO_DATE_RE);

function done() {
  revalidatePath("/tracker");
  revalidatePath("/admin/tracker");
}

/** Score a promise: log what happened and, optionally, change its status. */
export async function addUpdate(form: FormData) {
  await requireAdmin();
  const input = z
    .object({
      promiseId: z.uuid(),
      date: isoDate,
      status: z.enum([...statusIds, ""]).transform((v) => (v ? (v as (typeof statusIds)[number]) : null)),
      note: z.string().trim().min(1).max(2000),
      url: httpUrl,
    })
    .parse(Object.fromEntries(form));
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(trackerUpdates).values(input as typeof trackerUpdates.$inferInsert);
    if (input.status) {
      await tx
        .update(trackerPromises)
        .set({ status: input.status as (typeof trackerPromises.$inferInsert)["status"], statusChangedAt: new Date() })
        .where(eq(trackerPromises.id, input.promiseId));
    }
  });
  done();
}

export async function deleteUpdate(form: FormData) {
  await requireAdmin();
  await getDb().delete(trackerUpdates).where(eq(trackerUpdates.id, z.uuid().parse(form.get("id"))));
  done();
}

/** Set a status without an update, e.g. to correct a mistake. */
export async function setStatus(form: FormData) {
  await requireAdmin();
  const { id, status } = z.object({ id: z.uuid(), status: z.enum(statusIds) }).parse(Object.fromEntries(form));
  await getDb()
    .update(trackerPromises)
    .set({ status: status as (typeof trackerPromises.$inferInsert)["status"], statusChangedAt: new Date() })
    .where(eq(trackerPromises.id, id));
  done();
}

const promiseFields = z.object({
  title: z.string().trim().min(1).max(400),
  specifics: z.string().trim().max(2000),
  area: z.string().trim().min(1).max(40),
  testKept: z.string().trim().max(2000),
  testPartly: z.string().trim().max(2000),
  testBroken: z.string().trim().max(2000),
  testRecord: z.string().trim().max(2000),
});

const blankToNull = (v: string) => v || null;

export async function editPromise(form: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(form.get("id"));
  const f = promiseFields.parse(Object.fromEntries(form));
  await getDb()
    .update(trackerPromises)
    .set({
      title: f.title,
      specifics: f.specifics,
      area: f.area,
      testKept: blankToNull(f.testKept),
      testPartly: blankToNull(f.testPartly),
      testBroken: blankToNull(f.testBroken),
      testRecord: blankToNull(f.testRecord),
    })
    .where(eq(trackerPromises.id, id));
  done();
}

/** A new commitment made after the campaign. */
export async function addPromise(form: FormData) {
  await requireAdmin();
  const input = z
    .object({
      title: z.string().trim().min(1).max(400),
      specifics: z.string().trim().max(2000),
      area: z.string().trim().min(1).max(40),
      sourceLabel: z.string().trim().max(200),
      sourceUrl: httpUrl,
    })
    .parse(Object.fromEntries(form));
  const sources = input.sourceLabel ? [{ label: input.sourceLabel, ...(input.sourceUrl ? { url: input.sourceUrl } : {}) }] : [];
  await getDb()
    .insert(trackerPromises)
    .values({
      number: sql`coalesce((select max(number) from tracker_promises), 0) + 1`,
      title: input.title,
      specifics: input.specifics,
      area: input.area,
      sources,
    });
  done();
}

export async function deletePromise(form: FormData) {
  await requireAdmin();
  await getDb().delete(trackerPromises).where(eq(trackerPromises.id, z.uuid().parse(form.get("id"))));
  done();
}

export async function addAnnouncement(form: FormData) {
  await requireAdmin();
  const input = z
    .object({
      date: isoDate,
      title: z.string().trim().min(1).max(300),
      commitments: z.string().trim().min(1).max(4000),
      sourceLabel: z.string().trim().max(200),
      sourceUrl: httpUrl,
    })
    .parse(Object.fromEntries(form));
  const dateLabel = new Date(`${input.date}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const sources = input.sourceLabel ? [{ label: input.sourceLabel, ...(input.sourceUrl ? { url: input.sourceUrl } : {}) }] : [];
  await getDb()
    .insert(trackerAnnouncements)
    .values({ date: input.date, dateLabel, title: input.title, commitments: input.commitments, sources })
    .onConflictDoNothing();
  done();
}

export async function deleteAnnouncement(form: FormData) {
  await requireAdmin();
  await getDb().delete(trackerAnnouncements).where(eq(trackerAnnouncements.id, z.uuid().parse(form.get("id"))));
  done();
}
