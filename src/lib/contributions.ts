// Pure contribution rules shared by the donate widget, the API and the
// Stripe webhook. No server-only imports so the client can use them too.

export type Frequency = "one_time" | "monthly";
export type Tier = "standard" | "star" | "superstar";
export type Slate = "council" | "school_board";
export type SlateAmounts = Partial<Record<Slate, number>>;

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

/** Year and month in Pacific time, which is how contribution years are counted. */
export function pacificYearMonth(date: Date): { year: number; monthIndex: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "numeric" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), monthIndex: get("month") - 1 };
}

export interface LimitCheckInput {
  frequency: Frequency;
  slateAmounts: SlateAmounts;
  /** Accepted contributions so far this calendar year, per slate. */
  yearToDate: SlateAmounts;
  /** Payments already scheduled for the rest of this year by active monthly gifts, per slate. */
  committed: SlateAmounts;
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
 * A monthly gift counts every payment left in the year, and must also fit
 * within a full year on its own.
 */
export function checkAnnualLimit(input: LimitCheckInput): LimitCheckResult {
  const { frequency, slateAmounts, yearToDate, committed, limitCents, monthIndex } = input;
  for (const slate of Object.keys(slateAmounts) as Slate[]) {
    const amount = slateAmounts[slate] ?? 0;
    if (amount <= 0) continue;
    const used = (yearToDate[slate] ?? 0) + (committed[slate] ?? 0);
    const remaining = Math.max(0, limitCents - used);
    const thisYear = frequency === "monthly" ? amount * paymentsLeftThisYear(monthIndex) : amount;
    const fullYear = frequency === "monthly" ? amount * 12 : amount;
    if (thisYear > remaining || fullYear > limitCents) return { ok: false, slate, remainingCents: remaining };
  }
  return { ok: true };
}

/** The part of a payment that would exceed the limit and must be returned. */
export function excessOverLimit(acceptedSoFarCents: number, paymentCents: number, limitCents: number): number {
  return Math.max(0, Math.min(paymentCents, acceptedSoFarCents + paymentCents - limitCents));
}
