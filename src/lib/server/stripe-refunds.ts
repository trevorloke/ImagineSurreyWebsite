import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { contributions } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

type Contribution = typeof contributions.$inferSelect;

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/**
 * Send Stripe every refund the webhook decided on. The webhook transaction
 * only records what must go back (refund_pending_cents), so no Stripe call
 * ever runs while a database connection is pinned; this runs after it
 * commits, and again on every later webhook, so a refund that failed is
 * retried. The idempotency key is per contribution: a retry can't refund
 * twice. Once Stripe has it, the amount moves into refunded_cents.
 */
export async function issuePendingRefunds(db: Db): Promise<{ issued: number; failed: number }> {
  const rows = await db.select().from(contributions).where(gt(contributions.refundPendingCents, 0));
  let issued = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await issueRefund(db, row);
      issued += 1;
    } catch (err) {
      failed += 1;
      console.error(`Over-limit refund for contribution ${row.id} failed; it will be retried on the next webhook.`, err);
    }
  }
  return { issued, failed };
}

async function issueRefund(db: Db, row: Contribution): Promise<void> {
  const paymentIntentId = row.stripePaymentIntentId ?? (await resolvePaymentIntent(db, row));
  if (!paymentIntentId) throw new Error("No payment intent to refund against.");
  const amount = row.refundPendingCents;
  await getStripe().refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      reason: "requested_by_customer",
      metadata: { reason: "over_annual_contribution_limit", contributionId: row.id },
    },
    { idempotencyKey: `over-limit-${row.id}` },
  );
  await db
    .update(contributions)
    .set({
      refundedCents: sql`${contributions.refundedCents} + ${amount}`,
      refundPendingCents: 0,
      status: sql`case when ${contributions.refundedCents} + ${amount} >= ${contributions.amountCents} then 'refunded_over_limit'::contribution_status else ${contributions.status} end`,
    })
    .where(and(eq(contributions.id, row.id), eq(contributions.refundPendingCents, amount)));
}

/** A monthly payment recorded before its payment intent was known: look it up from the invoice. */
async function resolvePaymentIntent(db: Db, row: Contribution): Promise<string | null> {
  if (!row.stripeInvoiceId) return null;
  const payments = await getStripe().invoicePayments.list({ invoice: row.stripeInvoiceId, limit: 10 });
  const paid = payments.data.find((p) => p.status === "paid") ?? payments.data[0];
  const paymentIntentId = idOf(paid?.payment?.payment_intent);
  if (paymentIntentId) {
    await db.update(contributions).set({ stripePaymentIntentId: paymentIntentId }).where(eq(contributions.id, row.id));
  }
  return paymentIntentId;
}
