import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { memberships, people } from "@/lib/db/schema";
import type { Slot } from "@/lib/shifts";
import { deletionRequestPerson, membershipPerson, newsletterPerson, shiftPerson, signaturePerson, type StarbasePerson } from "./starbase";
import { deliverSoon, enqueueStarbase, type OutboxKind } from "./starbase-outbox";

// What the website forwards to Starbase, and from where. Each is called only
// after the website itself has accepted the submission, with only what the
// person typed into that form. None of them throws: a problem with Starbase
// must never fail a visitor's form or a Stripe webhook.
//
// Never forwarded: donations, monthly gifts, shop orders, event RSVPs,
// promise-tracker follows, preference changes and anything done in /admin
// (tests/starbase-boundary.test.ts holds that line). Gifts are logged at the
// desk by the treasurer (/admin/desk-gifts), where the limits are checked.

async function forward(db: Db, kind: OutboxKind, personId: string | null, person: StarbasePerson | null): Promise<void> {
  try {
    if (await enqueueStarbase(db, { kind, personId, person })) deliverSoon(db);
  } catch (err) {
    console.error(`Could not forward a ${kind} to Starbase`, err);
  }
}

/** A new petition or pledge signature (/api/signatures). */
export async function forwardSignature(
  db: Db,
  s: {
    personId: string;
    campaign: { kind: "petition" | "pledge"; slug: string; title: string };
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    /** True only when the email-updates grant was recorded for this submission. */
    newsletter: boolean;
  },
): Promise<void> {
  const person = signaturePerson({ kind: s.campaign.kind, slug: s.campaign.slug, title: s.campaign.title, firstName: s.firstName, lastName: s.lastName, email: s.email, phone: s.phone, address: s.address, postalCode: s.postalCode, newsletter: s.newsletter });
  await forward(db, s.campaign.kind, s.personId, person);
}

/** A newsletter address that has just become "subscribed" (single opt-in, or the confirmation click). */
export async function forwardNewsletter(db: Db, s: { personId: string | null; email: string; source?: string | null }): Promise<void> {
  await forward(db, "newsletter", s.personId, newsletterPerson({ email: s.email, source: s.source }));
}

/** A new volunteer shift sign-up (/api/volunteer/signup). */
export async function forwardShift(
  db: Db,
  s: {
    personId: string;
    name: string;
    email: string;
    phone?: string | null;
    postalCode?: string | null;
    opening: { title: string; date: string; slot: Slot; location?: string | null };
    /** The form's email-updates tick. */
    newsletter: boolean;
  },
): Promise<void> {
  await forward(db, "volunteer-shift", s.personId, shiftPerson(s));
}

/**
 * A membership that has just become active (after the Stripe webhook commits,
 * or at once when the fee is 0), from its own snapshot. Never the fee.
 */
export async function forwardMembership(db: Db, membershipId: string): Promise<void> {
  try {
    const m = await db.query.memberships.findFirst({ where: eq(memberships.id, membershipId) });
    if (!m || m.status !== "active") return;
    const person = await db.query.people.findFirst({ where: eq(people.id, m.personId), columns: { email: true } });
    if (!person) return;
    const payload = membershipPerson({
      memberName: m.memberName,
      email: person.email,
      memberPhone: m.memberPhone,
      memberAddress: m.memberAddress,
      memberCity: m.memberCity,
      memberPostalCode: m.memberPostalCode,
      interestVolunteer: m.interestVolunteer,
      interestLawnSign: m.interestLawnSign,
      updatesConsent: m.updatesConsent,
    });
    await forward(db, "membership", m.personId, payload);
  } catch (err) {
    console.error("Could not forward a membership to Starbase", err);
  }
}

/** "Delete my account" from the supporter portal: a request for the desk to do the same. */
export async function forwardDeletionRequest(db: Db, p: { id: string; email: string; firstName: string | null; lastName: string | null }, date: string): Promise<void> {
  await forward(db, "deletion-request", p.id, deletionRequestPerson({ firstName: p.firstName, lastName: p.lastName, email: p.email, date }));
}
