"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { events, newsPosts, products } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/server/admin-auth";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}

/** "2026-11-05T19:00" typed in Surrey → the right instant. */
function pacificLocalToDate(local: string): Date {
  const asUtc = new Date(`${local}:00Z`);
  const offset = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", timeZoneName: "shortOffset" }).formatToParts(d);
    const m = /GMT([+-]\d+)/.exec(parts.find((p) => p.type === "timeZoneName")?.value ?? "");
    return m ? Number(m[1]) : -8;
  };
  return new Date(asUtc.getTime() - offset(asUtc) * 3600_000);
}

const newsInput = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(400),
  body: z.string().trim().min(1).max(50_000),
  publish: z.enum(["now", "draft"]),
});

export async function createNews(form: FormData) {
  await requireAdmin();
  const input = newsInput.parse(Object.fromEntries(form));
  const db = getDb();
  await db.insert(newsPosts).values({
    slug: `${slugify(input.title)}-${Date.now().toString(36)}`,
    title: input.title,
    summary: input.summary,
    body: input.body,
    publishedAt: input.publish === "now" ? new Date() : null,
  });
  revalidatePath("/", "layout");
}

export async function setNewsPublished(form: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(form.get("id"));
  const publish = form.get("publish") === "1";
  await getDb().update(newsPosts).set({ publishedAt: publish ? new Date() : null }).where(eq(newsPosts.id, id));
  revalidatePath("/", "layout");
}

export async function deleteNews(form: FormData) {
  await requireAdmin();
  await getDb().delete(newsPosts).where(eq(newsPosts.id, z.uuid().parse(form.get("id"))));
  revalidatePath("/", "layout");
}

const eventInput = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  location: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20_000).optional().default(""),
});

export async function createEvent(form: FormData) {
  await requireAdmin();
  const input = eventInput.parse(Object.fromEntries(form));
  await getDb()
    .insert(events)
    .values({ ...input, slug: `${slugify(input.title)}-${Date.now().toString(36)}`, startsAt: pacificLocalToDate(input.startsAt) });
  revalidatePath("/", "layout");
}

export async function deleteEvent(form: FormData) {
  await requireAdmin();
  await getDb().delete(events).where(eq(events.id, z.uuid().parse(form.get("id"))));
  revalidatePath("/", "layout");
}

export async function updateProduct(form: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(form.get("id"));
  const dollars = z.coerce.number().positive().max(10_000).parse(form.get("price"));
  await getDb()
    .update(products)
    .set({ priceCents: Math.round(dollars * 100), active: form.get("active") === "on" })
    .where(eq(products.id, id));
  revalidatePath("/", "layout");
}
