import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { consentEvents, people } from "@/lib/db/schema";

export type ConsentChannel = "email" | "sms";
export type ConsentPurpose = "newsletter" | "updates" | "sms" | "fundraising" | "volunteer";
export type ConsentBasis = "express" | "implied-member" | "implied-donor" | "implied-volunteer";

export type ConsentInput = {
  personId?: string | null;
  email: string;
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  action: "grant" | "withdraw";
  basis?: ConsentBasis;
  /** The exact wording the person saw next to the tick box or in the confirmation. */
  wording?: string | null;
  /** Which form or process recorded it, e.g. "membership-form", "petition:skytrain", "preferences", "sms-stop". */
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export { CONSENT_WORDING } from "@/lib/consent-wording";

/**
 * Append one consent event and keep the person's current-state columns in step:
 * email grants set contactConsentAt (if blank), email withdrawals clear it;
 * sms grants set smsConsentAt, sms withdrawals clear it.
 */
export async function recordConsent(db: Db, input: ConsentInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  await db.insert(consentEvents).values({
    personId: input.personId ?? null,
    email,
    channel: input.channel,
    purpose: input.purpose,
    action: input.action,
    basis: input.basis ?? "express",
    wording: input.wording ?? null,
    source: input.source ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  if (!input.personId) return;
  if (input.channel === "sms") {
    await db
      .update(people)
      .set({ smsConsentAt: input.action === "grant" ? new Date() : null, updatedAt: new Date() })
      .where(eq(people.id, input.personId));
  } else if (input.action === "withdraw") {
    await db.update(people).set({ contactConsentAt: null, updatedAt: new Date() }).where(eq(people.id, input.personId));
  } else {
    const [row] = await db.select({ at: people.contactConsentAt }).from(people).where(eq(people.id, input.personId));
    if (row && !row.at) await db.update(people).set({ contactConsentAt: new Date(), updatedAt: new Date() }).where(eq(people.id, input.personId));
  }
}

/** The request details worth keeping as proof, read from a route handler's request. */
export function consentMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) || null;
  return { ip, userAgent };
}

/** The ledger for one person, newest first. */
export async function consentHistory(db: Db, personId: string, limit = 50) {
  return db.select().from(consentEvents).where(eq(consentEvents.personId, personId)).orderBy(desc(consentEvents.createdAt)).limit(limit);
}

/** The latest event for a channel and purpose, or undefined if the person never acted on it. */
export async function latestConsent(db: Db, personId: string, channel: ConsentChannel, purpose: ConsentPurpose) {
  const [row] = await db
    .select()
    .from(consentEvents)
    .where(and(eq(consentEvents.personId, personId), eq(consentEvents.channel, channel), eq(consentEvents.purpose, purpose)))
    .orderBy(desc(consentEvents.createdAt))
    .limit(1);
  return row;
}
