import "server-only";
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { events, newsPosts, products } from "@/lib/db/schema";

// These read live data, so pages that use them render per request.

export async function latestNews(limit = 3) {
  await connection();
  return getDb()
    .select()
    .from(newsPosts)
    .where(and(isNotNull(newsPosts.publishedAt), lte(newsPosts.publishedAt, new Date())))
    .orderBy(desc(newsPosts.publishedAt))
    .limit(limit);
}

export async function newsBySlug(slug: string) {
  await connection();
  return getDb().query.newsPosts.findFirst({
    where: and(eq(newsPosts.slug, slug), isNotNull(newsPosts.publishedAt), lte(newsPosts.publishedAt, new Date())),
  });
}

export async function upcomingEvents(limit = 20) {
  await connection();
  // Keep today's events listed until the end of the day.
  const since = new Date(Date.now() - 6 * 3600_000);
  return getDb()
    .select()
    .from(events)
    .where(and(eq(events.published, true), gte(events.startsAt, since)))
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

export async function eventBySlug(slug: string) {
  await connection();
  return getDb().query.events.findFirst({ where: and(eq(events.slug, slug), eq(events.published, true)) });
}

export async function activeProducts() {
  await connection();
  return getDb().select().from(products).where(eq(products.active, true)).orderBy(asc(products.sortOrder), asc(products.name));
}
