import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { newsletterSubscribers, people, promiseFollows } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { newsletterConfirmEmail } from "@/lib/email/messages";
import { emailContext, sendEmail } from "./email";
import { findOrCreatePerson } from "./people";
import { consumeToken, createToken, tokenUrl } from "./tokens";

export type SubscribeStatus = "pending" | "subscribed" | "unsubscribed";

const CONFIRM_TTL_MINUTES = 72 * 60;

const newToken = () => randomBytes(24).toString("base64url");

/**
 * Subscribe an address. With email configured this is double opt-in: the row
 * waits as "pending" until the confirmation link is clicked. Without it the
 * address is subscribed at once. A "subscribed" row is never downgraded and
 * an "unsubscribed" row is never flipped back: the address opted out, and
 * only an organizer acting on the person's own request can change that.
 */
export async function subscribe(db: Db, email: string, source: string, personId?: string): Promise<SubscribeStatus> {
  const normalized = email.trim().toLowerCase();
  const person = personId ? { id: personId } : await findOrCreatePerson(db, normalized, {}, { source: "newsletter" });
  const existing = await db.query.newsletterSubscribers.findFirst({ where: eq(newsletterSubscribers.email, normalized) });
  if (existing?.status === "unsubscribed") return "unsubscribed";
  if (existing?.status === "subscribed") return "subscribed";

  if (env.emailEnabled) {
    if (!existing) {
      await db
        .insert(newsletterSubscribers)
        .values({ email: normalized, personId: person.id, status: "pending", source, unsubscribeToken: newToken() })
        .onConflictDoNothing({ target: newsletterSubscribers.email });
    } else if (!existing.personId) {
      await db.update(newsletterSubscribers).set({ personId: person.id }).where(eq(newsletterSubscribers.id, existing.id));
    }
    const raw = await createToken(db, "newsletter-confirm", normalized, { ttlMinutes: CONFIRM_TTL_MINUTES, data: { personId: person.id, source } });
    const ctx = await emailContext();
    const message = newsletterConfirmEmail(ctx, tokenUrl("/api/newsletter/confirm", raw));
    await sendEmail(db, { to: normalized, ...message, kind: "newsletter-confirm", personId: person.id, unsubscribeUrl: null });
    return "pending";
  }

  // Single opt-in. The setWhere keeps an address that unsubscribed between
  // the read above and this write from being flipped back.
  const now = new Date();
  const [row] = await db
    .insert(newsletterSubscribers)
    .values({ email: normalized, personId: person.id, status: "subscribed", source, unsubscribeToken: newToken(), confirmedAt: now })
    .onConflictDoUpdate({
      target: newsletterSubscribers.email,
      set: { status: "subscribed", subscribedAt: sql`now()`, confirmedAt: sql`coalesce(${newsletterSubscribers.confirmedAt}, now())`, unsubscribedAt: null, source, personId: person.id },
      setWhere: sql`${newsletterSubscribers.status} <> 'unsubscribed'`,
    })
    .returning({ status: newsletterSubscribers.status });
  if (!row) return "unsubscribed";
  // Signing up is the person's own request to hear from us.
  await recordContactConsent(db, normalized, now);
  return "subscribed";
}

/** Contact consent on the person, when it was blank: the earliest consent stands. */
async function recordContactConsent(db: Db, email: string, at: Date): Promise<void> {
  await db
    .update(people)
    .set({ contactConsentAt: at, updatedAt: at })
    .where(and(eq(people.email, email), isNull(people.contactConsentAt)));
}

export type ConfirmResult = "subscribed" | "unsubscribed" | "invalid";

/**
 * The confirmation click from the double opt-in email. Marks a pending
 * address subscribed and records contact consent on the person if it was
 * blank. An address that unsubscribed stays unsubscribed, even if an older
 * confirmation link is clicked afterwards. Returns "invalid" for an unknown,
 * used or expired token.
 */
export async function confirmSubscription(db: Db, rawToken: string): Promise<ConfirmResult> {
  const token = await consumeToken(db, "newsletter-confirm", rawToken);
  if (!token) return "invalid";
  const now = new Date();
  const existing = await db.query.newsletterSubscribers.findFirst({ where: eq(newsletterSubscribers.email, token.email) });
  if (existing?.status === "unsubscribed") return "unsubscribed";
  if (existing) {
    const updated = await db
      .update(newsletterSubscribers)
      .set({ status: "subscribed", confirmedAt: sql`coalesce(${newsletterSubscribers.confirmedAt}, now())`, unsubscribedAt: null })
      .where(and(eq(newsletterSubscribers.id, existing.id), inArray(newsletterSubscribers.status, ["pending", "subscribed"])))
      .returning({ id: newsletterSubscribers.id });
    if (updated.length === 0) return "unsubscribed";
  } else {
    const personId = typeof token.data?.personId === "string" ? token.data.personId : (await findOrCreatePerson(db, token.email, {}, { source: "newsletter" })).id;
    const source = typeof token.data?.source === "string" ? token.data.source : "confirm";
    await db
      .insert(newsletterSubscribers)
      .values({ email: token.email, personId, status: "subscribed", source, unsubscribeToken: newToken(), confirmedAt: now })
      .onConflictDoNothing({ target: newsletterSubscribers.email });
  }
  await recordContactConsent(db, token.email, now);
  return "subscribed";
}

/** Stop the newsletter for a token from an email link. Returns whether a row changed. */
export async function unsubscribeByToken(db: Db, token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const rows = await db
    .update(newsletterSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(and(eq(newsletterSubscribers.unsubscribeToken, token), inArray(newsletterSubscribers.status, ["subscribed", "pending"])))
    .returning({ id: newsletterSubscribers.id });
  return rows.length > 0;
}

/**
 * The unsubscribe token for an address that is about to get a bulk email,
 * creating a "pending" subscriber row when the address has none. Every
 * campaign email carries this link, members and donors included, and an
 * unsubscribed address drops out of every audience.
 */
export async function ensureSubscriberToken(db: Db, email: string, personId: string | null): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.query.newsletterSubscribers.findFirst({ where: eq(newsletterSubscribers.email, normalized), columns: { unsubscribeToken: true } });
  if (existing) return existing.unsubscribeToken;
  const [inserted] = await db
    .insert(newsletterSubscribers)
    .values({ email: normalized, personId, status: "pending", source: "campaign", unsubscribeToken: newToken() })
    .onConflictDoNothing({ target: newsletterSubscribers.email })
    .returning({ unsubscribeToken: newsletterSubscribers.unsubscribeToken });
  if (inserted) return inserted.unsubscribeToken;
  const row = await db.query.newsletterSubscribers.findFirst({ where: eq(newsletterSubscribers.email, normalized), columns: { unsubscribeToken: true } });
  if (!row) throw new Error(`No subscriber row for ${normalized}`);
  return row.unsubscribeToken;
}

/** The link in a campaign email that stops future bulk email for this subscriber. */
export function unsubscribeUrlFor(token: string): string {
  return tokenUrl("/newsletter/unsubscribe", token);
}

/** Stop promise-status emails for one follow link. Returns whether a follow was removed. */
export async function unfollowPromise(db: Db, token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const rows = await db.delete(promiseFollows).where(eq(promiseFollows.token, token)).returning({ id: promiseFollows.id });
  return rows.length > 0;
}
