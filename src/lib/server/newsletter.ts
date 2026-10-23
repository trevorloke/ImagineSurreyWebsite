import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import { upsertPerson } from "./people";

/** Subscribe an address, or re-subscribe one that had unsubscribed. */
export async function subscribe(db: Db, email: string, source: string, personId?: string) {
  const person = personId ? { id: personId } : await upsertPerson(db, email);
  await db
    .insert(newsletterSubscribers)
    .values({ email: email.toLowerCase(), personId: person.id, source, unsubscribeToken: randomBytes(24).toString("base64url") })
    .onConflictDoUpdate({
      target: newsletterSubscribers.email,
      set: { status: "subscribed", subscribedAt: sql`now()`, unsubscribedAt: null, source, personId: person.id },
      setWhere: sql`${newsletterSubscribers.status} = 'unsubscribed'`,
    });
}
