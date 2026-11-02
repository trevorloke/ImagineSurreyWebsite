import "server-only";
import type { Db } from "@/lib/db";

/**
 * Hooks called after a supporter does something, from route handlers and the
 * Stripe webhook (after its transaction commits). The communications module
 * implements them: each one builds the right email or text, respects consent,
 * and records it. They must never throw into the caller: a failed email must
 * not undo a payment or a signature.
 */
export async function notifyMembershipActive(db: Db, input: { membershipId: string }): Promise<void> {
  void db;
  void input;
}

export async function notifyDonationSucceeded(db: Db, input: { contributionIds: string[] }): Promise<void> {
  void db;
  void input;
}

export async function notifyRecurringStarted(db: Db, input: { recurringDonationId: string }): Promise<void> {
  void db;
  void input;
}

export async function notifyOrderPaid(db: Db, input: { orderId: string }): Promise<void> {
  void db;
  void input;
}

export async function notifySignature(db: Db, input: { signatureId: string }): Promise<void> {
  void db;
  void input;
}

export async function notifyRsvp(db: Db, input: { rsvpId: string }): Promise<void> {
  void db;
  void input;
}

export async function notifyShiftSignup(db: Db, input: { shiftId: string }): Promise<void> {
  void db;
  void input;
}

export async function notifyPromiseStatusChanged(db: Db, input: { promiseId: string; previous: string; next: string }): Promise<void> {
  void db;
  void input;
}
