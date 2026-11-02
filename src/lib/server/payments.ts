import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { contributions, memberships, orderItems, orders, people, products, recurringDonations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getStripe, type Stripe } from "@/lib/stripe";
import { membershipTerm, MIN_DONATION_CENTS, slateAmountsFor, totalCents, type Slate } from "@/lib/contributions";
import { formatCents } from "@/lib/money";
import { ageOn, BC_POSTAL_CODE_RE, MIN_MEMBER_AGE, normalizePostalCode, OUTSIDE_SURREY } from "@/lib/neighbourhoods";
import type { cartSchema, donationSchema, membershipSchema } from "@/lib/validation";
import { assertWithinLimit, lockPerson, SLATE_LABEL, UserFacingError, type Querier } from "./limits";
import { notifyMembershipActive } from "./notifications";
import { findOrCreatePerson, type Person } from "./people";
import { subscribe } from "./newsletter";

export { contributionRoom, UserFacingError } from "./limits";
export { addYear } from "@/lib/contributions";

// Stripe's minimum Checkout lifetime is 30 minutes, measured when the request
// arrives, so a little slack keeps a slow request from being refused.
const CHECKOUT_TTL_MINUTES = 35;

// ── Public form extras ─────────────────────────────────────────────────────

/** Optional hints a public form may send beside its validated fields. */
export interface PublicFormExtras {
  /** Where the person came from: a flyer, a campaign page, a share link. */
  source?: string;
  /** The referral code of the supporter who sent them. */
  ref?: string;
}

const extrasSchema = z.looseObject({
  source: z.string().trim().min(1).max(40).optional(),
  ref: z.string().trim().min(1).max(12).optional(),
});

const FORWARDED_HEADERS = ["content-type", "x-forwarded-for", "x-real-ip"];

/**
 * Take `source` and `ref` off a JSON body before the strict form schema sees
 * it, and hand back a request that parseBody can validate as usual. A body
 * that isn't a JSON object is passed through so parseBody reports it.
 */
export async function splitPublicFormExtras(req: NextRequest): Promise<{ request: NextRequest; extras: PublicFormExtras }> {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const rebuild = (body: string) => new NextRequest(req.url, { method: req.method, headers, body });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { request: rebuild(""), extras: {} };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { request: rebuild(JSON.stringify(raw)), extras: {} };

  const { source, ref, ...rest } = raw as Record<string, unknown>;
  const parsed = extrasSchema.safeParse({ source, ref });
  const extras: PublicFormExtras = parsed.success ? { source: parsed.data.source, ref: parsed.data.ref } : {};
  return { request: rebuild(JSON.stringify(rest)), extras };
}

// ── Stripe customers ───────────────────────────────────────────────────────

/** A stored customer id is only reused in the Stripe mode that created it. */
function reusableCustomerId(person: Person): string | null {
  return person.stripeCustomerId && person.stripeCustomerMode === env.stripeMode ? person.stripeCustomerId : null;
}

function isMissingCustomer(err: unknown): boolean {
  const e = err as { code?: unknown; param?: unknown } | null;
  return Boolean(e) && e?.code === "resource_missing" && e?.param === "customer";
}

type CustomerParams = { customer: string } | { customer_email: string; customer_creation?: "always" };

function customerParams(customerId: string | null, email: string, mode: "payment" | "subscription"): CustomerParams {
  if (customerId) return { customer: customerId };
  // Subscriptions always create a customer; payments must ask for one so the next checkout can reuse it.
  return mode === "payment" ? { customer_email: email, customer_creation: "always" } : { customer_email: email };
}

/**
 * Create a Checkout session for a person. When Stripe no longer knows the
 * stored customer (deleted, or captured in the other mode before modes were
 * recorded), the id is forgotten and the session is created once more as a
 * new customer.
 */
async function createCheckoutSession(
  db: Db,
  person: Person,
  build: (customerId: string | null) => Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const reusable = reusableCustomerId(person);
  try {
    return await stripe.checkout.sessions.create(build(reusable));
  } catch (err) {
    if (!reusable || !isMissingCustomer(err)) throw err;
    await db
      .update(people)
      .set({ stripeCustomerId: null, stripeCustomerMode: null })
      .where(and(eq(people.id, person.id), eq(people.stripeCustomerId, reusable)));
    return stripe.checkout.sessions.create(build(null));
  }
}

function checkoutBase() {
  return {
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_MINUTES * 60,
    locale: "en" as const,
  };
}

// ── Donations ──────────────────────────────────────────────────────────────

export async function createDonationCheckout(db: Db, input: z.output<typeof donationSchema>, extras: PublicFormExtras = {}) {
  const limitCents = env.contributionLimitCents;
  if (input.tier === "standard" && input.amountCents < MIN_DONATION_CENTS) {
    throw new UserFacingError(`The smallest contribution we can take online is ${formatCents(MIN_DONATION_CENTS)}.`);
  }
  const slateAmounts = slateAmountsFor(input.tier, input.frequency, input.amountCents, limitCents);
  const postalCode = normalizePostalCode(input.postalCode);

  const person = await findOrCreatePerson(
    db,
    input.email,
    {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      address: input.address,
      city: input.city,
      province: "BC",
      postalCode,
      ...(input.newsletter ? { contactConsentAt: new Date() } : {}),
    },
    { source: extras.source ?? "donation", referredByCode: extras.ref },
  );

  const snapshot = {
    personId: person.id,
    contributorName: `${input.firstName} ${input.lastName}`,
    contributorAddress: input.address,
    contributorCity: input.city,
    contributorPostalCode: postalCode,
    eligibilityAttestedAt: new Date(),
  };
  const slates = Object.keys(slateAmounts) as Slate[];
  const lineName = (slate: Slate) =>
    slates.length > 1 ? `Contribution to Imagine Surrey (${SLATE_LABEL[slate]})` : "Contribution to Imagine Surrey";

  if (input.frequency === "monthly") {
    // The limit check and the row insert share one transaction and the person's lock.
    const gift = await db.transaction(async (tx) => {
      await lockPerson(tx, person.id);
      await assertWithinLimit(tx, person.id, "monthly", slateAmounts);
      const [row] = await tx.insert(recurringDonations).values({ ...snapshot, slateAmounts }).returning();
      return row;
    });
    if (input.newsletter) await subscribe(db, person.email, "donation", person.id);

    const metadata = { type: "recurring_donation", recurringDonationId: gift.id, personId: person.id };
    let session: Stripe.Checkout.Session;
    try {
      session = await createCheckoutSession(db, person, (customerId) => ({
        ...customerParams(customerId, person.email, "subscription"),
        ...checkoutBase(),
        mode: "subscription",
        line_items: slates.map((slate) => ({
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: slateAmounts[slate]!,
            recurring: { interval: "month" as const },
            product_data: { name: `Monthly ${lineName(slate).toLowerCase()} · Imagine Victory Fund` },
          },
        })),
        metadata,
        subscription_data: { metadata },
        success_url: `${env.siteUrl}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.siteUrl}/donate?frequency=monthly&cancelled=1`,
      }));
    } catch (err) {
      await db
        .update(recurringDonations)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(and(eq(recurringDonations.id, gift.id), eq(recurringDonations.status, "pending")));
      throw err;
    }
    await db.update(recurringDonations).set({ stripeCheckoutSessionId: session.id }).where(eq(recurringDonations.id, gift.id));
    return { url: session.url! };
  }

  const rows = await db.transaction(async (tx) => {
    await lockPerson(tx, person.id);
    await assertWithinLimit(tx, person.id, "one_time", slateAmounts);
    return tx
      .insert(contributions)
      .values(slates.map((slate) => ({ ...snapshot, kind: "donation" as const, frequency: "one_time" as const, slate, amountCents: slateAmounts[slate]! })))
      .returning({ id: contributions.id });
  });
  if (input.newsletter) await subscribe(db, person.email, "donation", person.id);

  const ids = rows.map((r) => r.id);
  const metadata = { type: "donation", personId: person.id };
  let session: Stripe.Checkout.Session;
  try {
    session = await createCheckoutSession(db, person, (customerId) => ({
      ...customerParams(customerId, person.email, "payment"),
      ...checkoutBase(),
      mode: "payment",
      submit_type: "donate",
      line_items: slates.map((slate) => ({
        quantity: 1,
        price_data: { currency: "cad", unit_amount: slateAmounts[slate]!, product_data: { name: lineName(slate) } },
      })),
      metadata,
      payment_intent_data: { metadata, description: `Contribution of ${formatCents(totalCents(slateAmounts))}` },
      success_url: `${env.siteUrl}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/donate?cancelled=1`,
    }));
  } catch (err) {
    await db
      .update(contributions)
      .set({ status: "failed" })
      .where(and(inArray(contributions.id, ids), eq(contributions.status, "pending")));
    throw err;
  }
  await db.update(contributions).set({ stripeCheckoutSessionId: session.id }).where(inArray(contributions.id, ids));
  return { url: session.url! };
}

// ── Memberships ────────────────────────────────────────────────────────────

/**
 * The only two answers the membership form gets. Neither says whether the
 * email already belongs to a member: that would tell anyone who typed an
 * address which party its owner supports.
 */
export type MembershipResult = { status: "checkout"; url: string } | { status: "received" };

/** When the person's latest active membership ends, if any is still running. */
export async function latestActiveMembershipExpiry(q: Querier, personId: string, now = new Date()): Promise<Date | null> {
  const latest = await q.query.memberships.findFirst({
    where: and(eq(memberships.personId, personId), eq(memberships.status, "active"), gt(memberships.expiresAt, now)),
    orderBy: (m, { desc }) => [desc(m.expiresAt)],
    columns: { expiresAt: true },
  });
  return latest?.expiresAt ?? null;
}

export async function createMembership(db: Db, input: z.output<typeof membershipSchema>, extras: PublicFormExtras = {}): Promise<MembershipResult> {
  const feeCents = env.membershipFeeCents;
  const age = ageOn(input.birthdate, new Date());
  if (age === undefined || age < MIN_MEMBER_AGE) {
    throw new UserFacingError(`Members must be ${MIN_MEMBER_AGE} or older.`, { birthdate: `Members must be ${MIN_MEMBER_AGE} or older` });
  }
  if (feeCents > 0) {
    if (input.citizenshipStatus === "Other") {
      throw new UserFacingError("Under BC election law we can only take membership fees from Canadian citizens and permanent residents.", {
        citizenshipStatus: "Membership fees count as contributions under BC law",
      });
    }
    if (!BC_POSTAL_CODE_RE.test(input.postalCode)) {
      throw new UserFacingError("Under BC election law we can only take membership fees from people who live in BC.", {
        postalCode: "Enter a BC postal code",
      });
    }
  }

  const postalCode = normalizePostalCode(input.postalCode);
  const person = await findOrCreatePerson(
    db,
    input.email,
    {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      address: input.address,
      city: input.city,
      province: BC_POSTAL_CODE_RE.test(postalCode) ? "BC" : undefined,
      postalCode,
      neighbourhood: input.neighbourhood,
      birthdate: input.birthdate,
      citizenshipStatus: input.citizenshipStatus,
      gender: input.gender || undefined,
      languages: input.languages,
      student: input.student,
      campus: input.student ? input.campus || undefined : undefined,
      issue: input.issue,
      interestVolunteer: input.interestVolunteer,
      interestLawnSign: input.interestLawnSign,
      contactConsentAt: new Date(),
    },
    { source: extras.source ?? "membership", referredByCode: extras.ref },
  );
  await subscribe(db, person.email, "membership", person.id);

  const votingEligible = input.neighbourhood !== OUTSIDE_SURREY && input.city.trim().toLowerCase() === "surrey";
  // The details as given on this form, kept with the membership for the voting roll.
  const snapshot = {
    personId: person.id,
    feeCents,
    votingEligible,
    memberName: `${input.firstName} ${input.lastName}`,
    memberAddress: input.address,
    memberCity: input.city,
    memberPostalCode: postalCode,
    memberNeighbourhood: input.neighbourhood,
  };

  if (feeCents === 0) {
    // Free membership: active at once, extending any membership still running.
    const membership = await db.transaction(async (tx) => {
      await lockPerson(tx, person.id);
      const term = membershipTerm(await latestActiveMembershipExpiry(tx, person.id), new Date());
      const [row] = await tx
        .insert(memberships)
        .values({ ...snapshot, status: "active", ...term })
        .returning({ id: memberships.id });
      return row;
    });
    try {
      await notifyMembershipActive(db, { membershipId: membership.id });
    } catch (err) {
      console.error("Membership notification failed", err);
    }
    return { status: "received" };
  }

  const { membership, contribution } = await db.transaction(async (tx) => {
    await lockPerson(tx, person.id);
    try {
      await assertWithinLimit(tx, person.id, "one_time", { council: feeCents });
    } catch (err) {
      if (!(err instanceof UserFacingError)) throw err;
      throw new UserFacingError(
        "Under BC's contribution limit we can't take a membership fee from you this year. Email hello@imaginesurrey.ca and we'll sort out your membership.",
      );
    }
    const [membership] = await tx.insert(memberships).values(snapshot).returning({ id: memberships.id });
    const [contribution] = await tx
      .insert(contributions)
      .values({
        personId: person.id,
        kind: "membership_fee",
        frequency: "one_time",
        slate: "council",
        amountCents: feeCents,
        contributorName: `${input.firstName} ${input.lastName}`,
        contributorAddress: input.address,
        contributorCity: input.city,
        contributorPostalCode: postalCode,
        eligibilityAttestedAt: new Date(),
      })
      .returning({ id: contributions.id });
    return { membership, contribution };
  });

  const metadata = { type: "membership", membershipId: membership.id, personId: person.id };
  let session: Stripe.Checkout.Session;
  try {
    session = await createCheckoutSession(db, person, (customerId) => ({
      ...customerParams(customerId, person.email, "payment"),
      ...checkoutBase(),
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: feeCents, product_data: { name: "Imagine Surrey membership (1 year)" } } }],
      metadata,
      payment_intent_data: { metadata, description: "Imagine Surrey membership fee" },
      success_url: `${env.siteUrl}/join/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/#join`,
    }));
  } catch (err) {
    await db
      .update(memberships)
      .set({ status: "cancelled" })
      .where(and(eq(memberships.id, membership.id), eq(memberships.status, "pending_payment")));
    await db
      .update(contributions)
      .set({ status: "failed" })
      .where(and(eq(contributions.id, contribution.id), eq(contributions.status, "pending")));
    throw err;
  }
  await db.update(memberships).set({ stripeCheckoutSessionId: session.id }).where(eq(memberships.id, membership.id));
  await db.update(contributions).set({ stripeCheckoutSessionId: session.id }).where(eq(contributions.id, contribution.id));
  return { status: "checkout", url: session.url! };
}

// ── Shop ───────────────────────────────────────────────────────────────────

export async function createOrderCheckout(db: Db, input: z.output<typeof cartSchema>) {
  const slugs = [...new Set(input.items.map((i) => i.slug))];
  const found = await db.select().from(products).where(and(inArray(products.slug, slugs), eq(products.active, true)));
  const bySlug = new Map(found.map((p) => [p.slug, p]));
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) throw new UserFacingError("Some items in your cart are no longer available. Please refresh the page.");

  // Merge duplicate lines for the same product.
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.slug, (quantities.get(item.slug) ?? 0) + item.quantity);
  const lines = [...quantities].map(([slug, quantity]) => ({ product: bySlug.get(slug)!, quantity }));
  const total = lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);

  const [order] = await db.insert(orders).values({ totalCents: total }).returning();
  await db.insert(orderItems).values(
    lines.map((l) => ({ orderId: order.id, productId: l.product.id, name: l.product.name, unitPriceCents: l.product.priceCents, quantity: l.quantity })),
  );

  const metadata = { type: "order", orderId: order.id };
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      ...checkoutBase(),
      mode: "payment",
      line_items: lines.map((l) => ({
        quantity: l.quantity,
        price_data: { currency: "cad", unit_amount: l.product.priceCents, product_data: { name: l.product.name } },
      })),
      shipping_address_collection: { allowed_countries: ["CA"] },
      phone_number_collection: { enabled: true },
      metadata,
      payment_intent_data: { metadata },
      success_url: `${env.siteUrl}/shop/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/shop`,
    });
  } catch (err) {
    await db
      .update(orders)
      .set({ status: "cancelled" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment")));
    throw err;
  }
  await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, order.id));
  return { url: session.url! };
}
