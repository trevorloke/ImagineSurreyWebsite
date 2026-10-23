import "server-only";
import { and, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "@/lib/db";
import { contributions, memberships, orderItems, orders, products, recurringDonations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getStripe, type Stripe } from "@/lib/stripe";
import {
  checkAnnualLimit,
  MIN_DONATION_CENTS,
  pacificYearMonth,
  slateAmountsFor,
  totalCents,
  type Slate,
  type SlateAmounts,
} from "@/lib/contributions";
import { formatCents } from "@/lib/money";
import { ageOn, BC_POSTAL_CODE_RE, MIN_MEMBER_AGE, normalizePostalCode, OUTSIDE_SURREY } from "@/lib/neighbourhoods";
import type { cartSchema, donationSchema, membershipSchema } from "@/lib/validation";
import { upsertPerson } from "./people";
import { subscribe } from "./newsletter";

// Unpaid Checkout sessions expire after this long; until then their amounts
// count toward the contributor's limit so two open tabs can't double up.
const CHECKOUT_TTL_MINUTES = 30;

export class UserFacingError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const SLATE_LABEL: Record<Slate, string> = { council: "city council slate", school_board: "school board slate" };

/** Start of a contribution year, Jan 1 in Pacific time (UTC-8 in winter). */
function yearBounds(year: number): [Date, Date] {
  return [new Date(Date.UTC(year, 0, 1, 8)), new Date(Date.UTC(year + 1, 0, 1, 8))];
}

/**
 * What this person has given (or has an open checkout for) this year, and
 * what their active monthly gifts will still take this year after this month.
 */
export async function contributionTotals(db: Db, personId: string, now = new Date()) {
  const { year, monthIndex } = pacificYearMonth(now);
  const [start, end] = yearBounds(year);
  const openSince = new Date(now.getTime() - CHECKOUT_TTL_MINUTES * 60_000);

  const rows = await db
    .select({ slate: contributions.slate, cents: sql<string>`sum(${contributions.amountCents} - ${contributions.refundedCents})` })
    .from(contributions)
    .where(
      and(
        eq(contributions.personId, personId),
        or(
          and(eq(contributions.status, "succeeded"), gte(contributions.paidAt, start), lt(contributions.paidAt, end)),
          and(eq(contributions.status, "pending"), gt(contributions.createdAt, openSince)),
        ),
      ),
    )
    .groupBy(contributions.slate);
  const yearToDate: SlateAmounts = {};
  for (const r of rows) yearToDate[r.slate] = Number(r.cents);

  const recurring = await db
    .select({ amounts: recurringDonations.slateAmounts, status: recurringDonations.status })
    .from(recurringDonations)
    .where(
      and(
        eq(recurringDonations.personId, personId),
        or(
          eq(recurringDonations.status, "active"),
          and(eq(recurringDonations.status, "pending"), gt(recurringDonations.createdAt, openSince)),
        ),
      ),
    );
  const committed: SlateAmounts = {};
  for (const r of recurring) {
    // An active gift's payment for this month is already in yearToDate; a
    // pending one hasn't made any payment yet.
    const payments = r.status === "active" ? 11 - monthIndex : 12 - monthIndex;
    for (const slate of Object.keys(r.amounts) as Slate[]) {
      committed[slate] = (committed[slate] ?? 0) + (r.amounts[slate] ?? 0) * payments;
    }
  }
  return { yearToDate, committed, monthIndex };
}

async function assertWithinLimit(db: Db, personId: string, frequency: "one_time" | "monthly", slateAmounts: SlateAmounts) {
  const totals = await contributionTotals(db, personId);
  const limitCents = env.contributionLimitCents;
  const result = checkAnnualLimit({ frequency, slateAmounts, limitCents, ...totals });
  if (result.ok) return;
  const remaining = result.remainingCents ?? 0;
  const slate = result.slate ? SLATE_LABEL[result.slate] : "slate";
  throw new UserFacingError(
    remaining === 0
      ? `You've reached this year's ${formatCents(limitCents)} contribution limit for our ${slate}. Thank you! You can give again in January.`
      : frequency === "monthly"
        ? `That monthly amount would take you over this year's ${formatCents(limitCents)} limit for our ${slate}. You can give up to ${formatCents(remaining)} more this year.`
        : `That would take you over this year's ${formatCents(limitCents)} limit for our ${slate}. You can give up to ${formatCents(remaining)} more this year.`,
  );
}

function checkoutBase(personEmail: string, stripeCustomerId: string | null) {
  return {
    ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: personEmail }),
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_MINUTES * 60,
    locale: "en" as const,
  };
}

// ── Donations ──────────────────────────────────────────────────────────────

export async function createDonationCheckout(db: Db, input: z.output<typeof donationSchema>) {
  const limitCents = env.contributionLimitCents;
  if (input.tier === "standard" && input.amountCents < MIN_DONATION_CENTS) {
    throw new UserFacingError(`The smallest contribution we can take online is ${formatCents(MIN_DONATION_CENTS)}.`);
  }
  const slateAmounts = slateAmountsFor(input.tier, input.frequency, input.amountCents, limitCents);

  const person = await upsertPerson(db, input.email, {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    address: input.address,
    city: input.city,
    province: "BC",
    postalCode: normalizePostalCode(input.postalCode),
    ...(input.newsletter ? { contactConsentAt: new Date() } : {}),
  });
  await assertWithinLimit(db, person.id, input.frequency, slateAmounts);
  if (input.newsletter) await subscribe(db, input.email, "donation", person.id);

  const snapshot = {
    personId: person.id,
    contributorName: `${input.firstName} ${input.lastName}`,
    contributorAddress: input.address,
    contributorCity: input.city,
    contributorPostalCode: normalizePostalCode(input.postalCode),
    eligibilityAttestedAt: new Date(),
  };
  const stripe = getStripe();
  const slates = Object.keys(slateAmounts) as Slate[];
  const lineName = (slate: Slate) =>
    slates.length > 1 ? `Contribution to Imagine Surrey (${SLATE_LABEL[slate]})` : "Contribution to Imagine Surrey";

  if (input.frequency === "monthly") {
    const [gift] = await db.insert(recurringDonations).values({ ...snapshot, slateAmounts }).returning();
    const metadata = { type: "recurring_donation", recurringDonationId: gift.id, personId: person.id };
    const session = await stripe.checkout.sessions.create({
      ...checkoutBase(person.email, person.stripeCustomerId),
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
    });
    await db.update(recurringDonations).set({ stripeCheckoutSessionId: session.id }).where(eq(recurringDonations.id, gift.id));
    return { url: session.url! };
  }

  const rows = await db
    .insert(contributions)
    .values(slates.map((slate) => ({ ...snapshot, kind: "donation" as const, frequency: "one_time" as const, slate, amountCents: slateAmounts[slate]! })))
    .returning({ id: contributions.id });
  const metadata = { type: "donation", personId: person.id };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      ...checkoutBase(person.email, person.stripeCustomerId),
      mode: "payment",
      customer_creation: person.stripeCustomerId ? undefined : "always",
      submit_type: "donate",
      line_items: slates.map((slate) => ({
        quantity: 1,
        price_data: { currency: "cad", unit_amount: slateAmounts[slate]!, product_data: { name: lineName(slate) } },
      })),
      metadata,
      payment_intent_data: { metadata, description: `Contribution of ${formatCents(totalCents(slateAmounts))}` },
      success_url: `${env.siteUrl}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/donate?cancelled=1`,
    });
  } catch (err) {
    await db.update(contributions).set({ status: "failed" }).where(inArray(contributions.id, rows.map((r) => r.id)));
    throw err;
  }
  await db
    .update(contributions)
    .set({ stripeCheckoutSessionId: session.id })
    .where(inArray(contributions.id, rows.map((r) => r.id)));
  return { url: session.url! };
}

// ── Memberships ────────────────────────────────────────────────────────────

export type MembershipResult = { status: "checkout"; url: string } | { status: "active" } | { status: "already_member"; expiresAt: Date };

export async function createMembership(db: Db, input: z.output<typeof membershipSchema>): Promise<MembershipResult> {
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
  const person = await upsertPerson(db, input.email, {
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
  });
  await subscribe(db, input.email, "membership", person.id);

  const current = await db.query.memberships.findFirst({
    where: and(eq(memberships.personId, person.id), eq(memberships.status, "active"), gt(memberships.expiresAt, new Date())),
  });
  // Renewals are open in the last two months of a membership.
  if (current?.expiresAt && current.expiresAt.getTime() - Date.now() > 61 * 24 * 3600_000) {
    return { status: "already_member", expiresAt: current.expiresAt };
  }

  const votingEligible = input.neighbourhood !== OUTSIDE_SURREY && input.city.trim().toLowerCase() === "surrey";
  if (feeCents === 0) {
    const startsAt = current?.expiresAt ?? new Date();
    await db.insert(memberships).values({ personId: person.id, status: "active", feeCents: 0, votingEligible, startsAt, expiresAt: addYear(startsAt) });
    return { status: "active" };
  }

  await assertWithinLimit(db, person.id, "one_time", { council: feeCents });
  const [membership] = await db.insert(memberships).values({ personId: person.id, feeCents, votingEligible }).returning();
  const [contribution] = await db
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
    .returning();

  const metadata = { type: "membership", membershipId: membership.id, personId: person.id };
  const session = await getStripe().checkout.sessions.create({
    ...checkoutBase(person.email, person.stripeCustomerId),
    mode: "payment",
    customer_creation: person.stripeCustomerId ? undefined : "always",
    line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: feeCents, product_data: { name: "Imagine Surrey membership (1 year)" } } }],
    metadata,
    payment_intent_data: { metadata, description: "Imagine Surrey membership fee" },
    success_url: `${env.siteUrl}/join/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}/#join`,
  });
  await db.update(memberships).set({ stripeCheckoutSessionId: session.id }).where(eq(memberships.id, membership.id));
  await db.update(contributions).set({ stripeCheckoutSessionId: session.id }).where(eq(contributions.id, contribution.id));
  return { status: "checkout", url: session.url! };
}

export function addYear(date: Date): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
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
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_MINUTES * 60,
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
  await db.update(orders).set({ stripeCheckoutSessionId: session.id }).where(eq(orders.id, order.id));
  return { url: session.url! };
}
