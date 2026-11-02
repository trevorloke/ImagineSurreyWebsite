// Pure contribution rules shared by the donate widget, the API, the Stripe
// webhook and the supporter portal. No server-only imports so the client can
// use them too, and every function is exported so tests can cover it.

export type Frequency = "one_time" | "monthly";
export type Tier = "standard" | "star" | "superstar";
export type Slate = "council" | "school_board";
export type SlateAmounts = Partial<Record<Slate, number>>;

/** Slates in the order money is allocated to them (refunds come off council first). */
export const SLATES: readonly Slate[] = ["council", "school_board"];

export const MIN_DONATION_CENTS = 500;

export const PRESETS_CENTS: Record<Frequency, number[]> = {
  one_time: [2500, 5000, 10000, 25000],
  monthly: [1000, 2500, 5000, 10000],
};

export const DEFAULT_CENTS: Record<Frequency, number> = { one_time: 5000, monthly: 2500 };

/** The Star Club gives the yearly maximum: at once, or across twelve months in whole dollars. */
export function starClubCents(frequency: Frequency, limitCents: number): number {
  return frequency === "monthly" ? Math.floor(limitCents / 12 / 100) * 100 : limitCents;
}

/**
 * How a donation splits across slates. The Superstar Club is the maximum to
 * both the council and the school board slates: two contributions, one payment.
 */
export function slateAmountsFor(tier: Tier, frequency: Frequency, amountCents: number, limitCents: number): SlateAmounts {
  if (tier === "standard") return { council: amountCents };
  const star = starClubCents(frequency, limitCents);
  return tier === "star" ? { council: star } : { council: star, school_board: star };
}

export function totalCents(amounts: SlateAmounts): number {
  return (amounts.council ?? 0) + (amounts.school_board ?? 0);
}

/** Monthly payments still to come this calendar year, counting the current month (0 = January). */
export function paymentsLeftThisYear(monthIndex: number): number {
  return 12 - monthIndex;
}

/**
 * Payments an active monthly gift will still make this year. This month's
 * payment is counted until it has actually arrived, so a gift billed on the
 * 20th still reserves its room on the 5th.
 */
export function remainingMonthlyPayments(monthIndex: number, paidThisMonth: boolean): number {
  return Math.max(0, paymentsLeftThisYear(monthIndex) - (paidThisMonth ? 1 : 0));
}

const PACIFIC = "America/Vancouver";

/** Year and month in Pacific time, which is how contribution years are counted. */
export function pacificYearMonth(date: Date): { year: number; monthIndex: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "numeric" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), monthIndex: get("month") - 1 };
}

/** Pacific wall-clock time minus UTC at `date`, in milliseconds (negative, e.g. -8h in winter). */
function pacificOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** Midnight on the first of a month in Pacific time, as an instant. Handles daylight-saving changes. */
export function pacificMonthStart(year: number, monthIndex: number): Date {
  const wall = Date.UTC(year, monthIndex, 1);
  let utc = wall + 8 * 3600_000;
  // Two passes settle the offset when the guess lands on the other side of a clock change.
  for (let i = 0; i < 2; i++) utc = wall - pacificOffsetMs(new Date(utc));
  return new Date(utc);
}

/** [start, end) of a contribution year: Jan 1 in Pacific time. */
export function pacificYearBounds(year: number): [Date, Date] {
  return [pacificMonthStart(year, 0), pacificMonthStart(year + 1, 0)];
}

/** [start, end) of a calendar month in Pacific time. */
export function pacificMonthBounds(year: number, monthIndex: number): [Date, Date] {
  const next = monthIndex === 11 ? pacificMonthStart(year + 1, 0) : pacificMonthStart(year, monthIndex + 1);
  return [pacificMonthStart(year, monthIndex), next];
}

export interface LimitCheckInput {
  frequency: Frequency;
  slateAmounts: SlateAmounts;
  /** Accepted contributions so far this calendar year, per slate. */
  yearToDate: SlateAmounts;
  /** Payments already scheduled for the rest of this year by active monthly gifts, per slate. */
  committed: SlateAmounts;
  /** Monthly amounts of the active monthly gifts, per slate: a new monthly gift must fit beside them for a full year. */
  monthlyActive?: SlateAmounts;
  limitCents: number;
  /** The current month in Pacific time, 0 = January. */
  monthIndex: number;
}

export interface LimitCheckResult {
  ok: boolean;
  /** The slate that would go over, when not ok. */
  slate?: Slate;
  /** The most this person can still give to that slate this year. */
  remainingCents?: number;
}

/**
 * Would this gift take the contributor over the annual limit for any slate?
 * A monthly gift counts every payment left in the year, and together with the
 * monthly gifts already running must also fit within a full year on its own.
 */
export function checkAnnualLimit(input: LimitCheckInput): LimitCheckResult {
  const { frequency, slateAmounts, yearToDate, committed, monthlyActive = {}, limitCents, monthIndex } = input;
  for (const slate of SLATES) {
    const amount = slateAmounts[slate] ?? 0;
    if (amount <= 0) continue;
    const used = (yearToDate[slate] ?? 0) + (committed[slate] ?? 0);
    const remaining = Math.max(0, limitCents - used);
    const thisYear = frequency === "monthly" ? amount * paymentsLeftThisYear(monthIndex) : amount;
    const fullYear = frequency === "monthly" ? (amount + (monthlyActive[slate] ?? 0)) * 12 : amount;
    if (thisYear > remaining || fullYear > limitCents) return { ok: false, slate, remainingCents: remaining };
  }
  return { ok: true };
}

/** The part of a payment that would exceed the limit and must be returned. */
export function excessOverLimit(acceptedSoFarCents: number, paymentCents: number, limitCents: number): number {
  return Math.max(0, Math.min(paymentCents, acceptedSoFarCents + paymentCents - limitCents));
}

export interface RefundableRow {
  id: string;
  slate: Slate;
  amountCents: number;
  refundedCents: number;
  /** Decided by the webhook but not yet sent to Stripe; counts as already returned. */
  refundPendingCents?: number;
  createdAt?: Date;
}

export interface RefundChange {
  id: string;
  /** The row's new refunded total. */
  refundedCents: number;
  /** True once nothing of the row is left with us. */
  fullyRefunded: boolean;
}

/**
 * Reconcile our rows for one payment with what Stripe says has been refunded
 * on its charge, so that the rows' refunded totals add up to Stripe's figure.
 * Any new amount is spread across the rows council first, each taking what it
 * has room for. Amounts our own over-limit refunds are about to return count
 * as returned already, so their charge.refunded event changes nothing.
 * Returns only the rows that change.
 */
export function allocateRefund(rows: RefundableRow[], amountRefundedCents: number): RefundChange[] {
  const accounted = rows.reduce((sum, r) => sum + r.refundedCents + (r.refundPendingCents ?? 0), 0);
  let delta = amountRefundedCents - accounted;
  const changes: RefundChange[] = [];
  if (delta <= 0) return changes;
  const ordered = [...rows].sort(
    (a, b) => SLATES.indexOf(a.slate) - SLATES.indexOf(b.slate) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );
  for (const row of ordered) {
    if (delta <= 0) break;
    const room = row.amountCents - row.refundedCents - (row.refundPendingCents ?? 0);
    if (room <= 0) continue;
    const take = Math.min(room, delta);
    delta -= take;
    const refundedCents = row.refundedCents + take;
    changes.push({ id: row.id, refundedCents, fullyRefunded: refundedCents >= row.amountCents });
  }
  return changes;
}

/**
 * What a Stripe subscription status means for a recurring gift. Stripe stops
 * collecting on canceled, unpaid and paused subscriptions, so they must stop
 * reserving the donor's limit; past_due keeps retrying and stays active.
 * Null means leave the gift as it is.
 */
export function recurringStatusFor(stripeStatus: string): "active" | "cancelled" | null {
  switch (stripeStatus) {
    case "canceled":
    case "unpaid":
    case "paused":
    case "incomplete_expired":
      return "cancelled";
    case "active":
    case "trialing":
      return "active";
    default:
      return null;
  }
}

export function addYear(date: Date): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/**
 * When a new membership runs. Joining while a membership is still active
 * extends it: the new term starts when the latest active one ends.
 */
export function membershipTerm(latestActiveExpiry: Date | null | undefined, now: Date): { startsAt: Date; expiresAt: Date } {
  const startsAt = latestActiveExpiry && latestActiveExpiry.getTime() > now.getTime() ? new Date(latestActiveExpiry) : new Date(now);
  return { startsAt, expiresAt: addYear(startsAt) };
}
