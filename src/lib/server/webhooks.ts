import "server-only";
import { and, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { contributions, memberships, orders, people, recurringDonations, stripeEvents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getStripe, type Stripe } from "@/lib/stripe";
import { excessOverLimit, pacificYearMonth, type Slate } from "@/lib/contributions";
import { addYear } from "./payments";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Apply one Stripe event to the database, exactly once. The event id is
 * recorded in the same transaction as its effects, so a failure rolls both
 * back and Stripe's retry gets a clean second attempt.
 */
export async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
    if (inserted.length === 0) return "duplicate";

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status === "unpaid") return "processed"; // Async method: wait for the success event.
        await checkoutPaid(tx, session);
        return "processed";
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        await checkoutAbandoned(tx, event.data.object);
        return "processed";
      case "invoice.paid":
        await invoicePaid(tx, event.data.object);
        return "processed";
      case "customer.subscription.deleted":
        await tx
          .update(recurringDonations)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(eq(recurringDonations.stripeSubscriptionId, event.data.object.id));
        return "processed";
      case "charge.refunded":
        await chargeRefunded(tx, event.data.object);
        return "processed";
      default:
        return "ignored";
    }
  });
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

async function checkoutPaid(tx: Tx, session: Stripe.Checkout.Session) {
  const type = session.metadata?.type;
  const paymentIntentId = idOf(session.payment_intent);
  const customerId = idOf(session.customer);
  const personId = session.metadata?.personId;
  if (personId && customerId) {
    await tx.update(people).set({ stripeCustomerId: customerId }).where(and(eq(people.id, personId), sql`${people.stripeCustomerId} is null`));
  }

  if (type === "donation" || type === "membership") {
    const paidAt = new Date();
    const rows = await tx
      .update(contributions)
      .set({ status: "succeeded", paidAt, stripePaymentIntentId: paymentIntentId })
      .where(and(eq(contributions.stripeCheckoutSessionId, session.id), eq(contributions.status, "pending")))
      .returning();
    await enforceLimit(tx, rows, paymentIntentId);
  }

  if (type === "membership") {
    const membership = await tx.query.memberships.findFirst({ where: eq(memberships.stripeCheckoutSessionId, session.id) });
    if (membership && membership.status === "pending_payment") {
      // A renewal starts when the current membership ends.
      const current = await tx.query.memberships.findFirst({
        where: and(eq(memberships.personId, membership.personId), eq(memberships.status, "active"), gt(memberships.expiresAt, new Date())),
        orderBy: (m, { desc }) => [desc(m.expiresAt)],
      });
      const startsAt = current?.expiresAt ?? new Date();
      await tx.update(memberships).set({ status: "active", startsAt, expiresAt: addYear(startsAt) }).where(eq(memberships.id, membership.id));
    }
  }

  if (type === "recurring_donation") {
    await tx
      .update(recurringDonations)
      .set({ status: "active", stripeSubscriptionId: idOf(session.subscription) })
      .where(and(eq(recurringDonations.stripeCheckoutSessionId, session.id), eq(recurringDonations.status, "pending")));
  }

  if (type === "order") {
    const shipping = session.collected_information?.shipping_details ?? null;
    await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: new Date(),
        email: session.customer_details?.email ?? null,
        shipping: shipping ? { ...shipping, phone: session.customer_details?.phone ?? null } : null,
        stripePaymentIntentId: paymentIntentId,
      })
      .where(and(eq(orders.stripeCheckoutSessionId, session.id), eq(orders.status, "pending_payment")));
  }
}

async function checkoutAbandoned(tx: Tx, session: Stripe.Checkout.Session) {
  await tx
    .update(contributions)
    .set({ status: "failed" })
    .where(and(eq(contributions.stripeCheckoutSessionId, session.id), eq(contributions.status, "pending")));
  await tx
    .update(memberships)
    .set({ status: "cancelled" })
    .where(and(eq(memberships.stripeCheckoutSessionId, session.id), eq(memberships.status, "pending_payment")));
  await tx
    .update(recurringDonations)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(recurringDonations.stripeCheckoutSessionId, session.id), eq(recurringDonations.status, "pending")));
  await tx
    .update(orders)
    .set({ status: "cancelled" })
    .where(and(eq(orders.stripeCheckoutSessionId, session.id), eq(orders.status, "pending_payment")));
}

/** Each monthly payment is recorded as a contribution per slate. */
async function invoicePaid(tx: Tx, invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details;
  if (!details) return;
  const subscriptionId = idOf(details.subscription);
  const giftId = details.metadata?.recurringDonationId;
  const gift = giftId
    ? await tx.query.recurringDonations.findFirst({ where: eq(recurringDonations.id, giftId) })
    : subscriptionId
      ? await tx.query.recurringDonations.findFirst({ where: eq(recurringDonations.stripeSubscriptionId, subscriptionId) })
      : undefined;
  if (!gift) return;

  // The first invoice can arrive before checkout.session.completed.
  if (gift.status === "pending") {
    await tx.update(recurringDonations).set({ status: "active", stripeSubscriptionId: subscriptionId }).where(eq(recurringDonations.id, gift.id));
  }

  const paidAt = invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
  const paymentIntentId = await invoicePaymentIntent(invoice.id!);
  const rows = await tx
    .insert(contributions)
    .values(
      (Object.keys(gift.slateAmounts) as Slate[]).map((slate) => ({
        personId: gift.personId,
        kind: "donation" as const,
        frequency: "monthly" as const,
        slate,
        fund: "imagine_victory_fund",
        amountCents: gift.slateAmounts[slate]!,
        status: "succeeded" as const,
        paidAt,
        contributorName: gift.contributorName,
        contributorAddress: gift.contributorAddress,
        contributorCity: gift.contributorCity,
        contributorPostalCode: gift.contributorPostalCode,
        eligibilityAttestedAt: gift.eligibilityAttestedAt,
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: subscriptionId,
        stripePaymentIntentId: paymentIntentId,
      })),
    )
    .onConflictDoNothing()
    .returning();
  await enforceLimit(tx, rows, paymentIntentId);
}

async function invoicePaymentIntent(invoiceId: string): Promise<string | null> {
  const payments = await getStripe().invoicePayments.list({ invoice: invoiceId, limit: 10 });
  const paid = payments.data.find((p) => p.status === "paid") ?? payments.data[0];
  return idOf(paid?.payment?.payment_intent);
}

/**
 * Backstop for the annual limit, run on every successful payment: anything
 * that takes a contributor over the limit for a slate is returned to them.
 */
async function enforceLimit(tx: Tx, rows: (typeof contributions.$inferSelect)[], paymentIntentId: string | null) {
  const limit = env.contributionLimitCents;
  let excessTotal = 0;
  for (const row of rows) {
    const { year } = pacificYearMonth(row.paidAt ?? new Date());
    const start = new Date(Date.UTC(year, 0, 1, 8));
    const end = new Date(Date.UTC(year + 1, 0, 1, 8));
    const [{ accepted }] = await tx
      .select({ accepted: sql<string>`coalesce(sum(${contributions.amountCents} - ${contributions.refundedCents}), 0)` })
      .from(contributions)
      .where(
        and(
          eq(contributions.personId, row.personId),
          eq(contributions.slate, row.slate),
          eq(contributions.status, "succeeded"),
          gte(contributions.paidAt, start),
          lt(contributions.paidAt, end),
          ne(contributions.id, row.id),
        ),
      );
    const excess = excessOverLimit(Number(accepted), row.amountCents, limit);
    if (excess === 0) continue;
    excessTotal += excess;
    await tx
      .update(contributions)
      .set({ refundedCents: excess, status: excess === row.amountCents ? "refunded_over_limit" : "succeeded" })
      .where(eq(contributions.id, row.id));
  }
  if (excessTotal > 0) {
    if (!paymentIntentId) throw new Error("Over-limit contribution has no payment intent to refund.");
    await getStripe().refunds.create(
      { payment_intent: paymentIntentId, amount: excessTotal, reason: "requested_by_customer", metadata: { reason: "over_annual_contribution_limit" } },
      { idempotencyKey: `over-limit-${paymentIntentId}` },
    );
  }
}

/** A full refund issued from the Stripe dashboard. */
async function chargeRefunded(tx: Tx, charge: Stripe.Charge) {
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId || charge.amount_refunded < charge.amount) return;
  const rows = await tx.query.contributions.findMany({
    where: and(eq(contributions.stripePaymentIntentId, paymentIntentId), eq(contributions.status, "succeeded")),
  });
  if (rows.length) {
    await tx
      .update(contributions)
      .set({ status: "refunded", refundedCents: sql`${contributions.amountCents}` })
      .where(inArray(contributions.id, rows.map((r) => r.id)));
    const membershipFee = rows.find((r) => r.kind === "membership_fee");
    if (membershipFee?.stripeCheckoutSessionId) {
      await tx.update(memberships).set({ status: "cancelled" }).where(eq(memberships.stripeCheckoutSessionId, membershipFee.stripeCheckoutSessionId));
    }
  }
  await tx.update(orders).set({ status: "refunded" }).where(eq(orders.stripePaymentIntentId, paymentIntentId));
}
