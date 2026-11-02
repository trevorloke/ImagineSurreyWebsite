import type { NextRequest } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventRsvps, events } from "@/lib/db/schema";
import { error, json, parseBody } from "@/lib/server/api";
import { invalidate, TAGS } from "@/lib/server/cache";
import { handle } from "@/lib/server/handle";
import { subscribe } from "@/lib/server/newsletter";
import { notifyRsvp } from "@/lib/server/notifications";
import { findOrCreatePerson } from "@/lib/server/people";
import { rsvpRequestSchema } from "@/lib/shift-validation";

// Body: { name, email, guests?, newsletter?, source?, ref?, website? }. Changing
// an RSVP (same email) updates it; a full event answers 409 with a message to show.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[slug]/rsvp">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const parsed = await parseBody(req, rsvpRequestSchema, "rsvp");
    if (!parsed.ok) return parsed.response;
    const db = getDb();
    const event = await db.query.events.findFirst({ where: and(eq(events.slug, slug), eq(events.published, true)) });
    if (!event) return error("We couldn't find that event.", 404);
    if (event.startsAt < new Date()) return error("This event has already happened.", 410);

    const { name, email, guests, newsletter, source, ref } = parsed.data;
    if (event.capacity != null) {
      // Everyone else going, so someone changing their own RSVP is not refused.
      const [{ going }] = await db
        .select({ going: sql<number>`(count(*) + coalesce(sum(${eventRsvps.guests}), 0))::int` })
        .from(eventRsvps)
        .where(and(eq(eventRsvps.eventId, event.id), ne(eventRsvps.email, email)));
      const remaining = event.capacity - going;
      if (remaining <= 0) return error("This event is full. Get the newsletter and we'll tell you about the next one.", 409);
      if (1 + guests > remaining) {
        return error(remaining === 1 ? "There's one spot left, so there isn't room for guests this time." : `There are only ${remaining} spots left, so bring at most ${remaining - 1} guests.`, 409);
      }
    }

    const [firstName, ...rest] = name.split(/\s+/);
    const person = await findOrCreatePerson(db, email, { firstName, lastName: rest.join(" ") || undefined }, { source: `event:${slug}`, referredByCode: ref ?? null });
    const [rsvp] = await db
      .insert(eventRsvps)
      .values({ eventId: event.id, personId: person.id, name, email, guests, source })
      .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.email], set: { name, guests, source: sql`coalesce(excluded.source, ${eventRsvps.source})` } })
      .returning({ id: eventRsvps.id });
    if (newsletter) await subscribe(db, email, `event:${slug}`, person.id);
    try {
      await notifyRsvp(db, { rsvpId: rsvp.id });
    } catch (err) {
      console.error("RSVP notification failed", err);
    }
    // The public pages show how many are going and the spots left.
    invalidate(TAGS.counters);
    return json({ ok: true });
  });
}
