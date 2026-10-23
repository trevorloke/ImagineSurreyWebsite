import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventRsvps, events } from "@/lib/db/schema";
import { error, json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { subscribe } from "@/lib/server/newsletter";
import { upsertPerson } from "@/lib/server/people";
import { rsvpSchema } from "@/lib/validation";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[slug]/rsvp">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const parsed = await parseBody(req, rsvpSchema, "rsvp");
    if (!parsed.ok) return parsed.response;
    const db = getDb();
    const event = await db.query.events.findFirst({ where: and(eq(events.slug, slug), eq(events.published, true)) });
    if (!event) return error("We couldn't find that event.", 404);
    if (event.startsAt < new Date()) return error("This event has already happened.", 410);

    const { name, email, guests, newsletter } = parsed.data;
    const [firstName, ...rest] = name.split(/\s+/);
    const person = await upsertPerson(db, email, { firstName, lastName: rest.join(" ") || undefined });
    await db
      .insert(eventRsvps)
      .values({ eventId: event.id, personId: person.id, name, email, guests })
      .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.email], set: { name, guests } });
    if (newsletter) await subscribe(db, email, `event:${slug}`, person.id);
    return json({ ok: true });
  });
}
