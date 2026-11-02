// The "other amount" box on the donate form: pure rules, unit-tested.
import { MIN_DONATION_CENTS, starClubCents, type Frequency, type Tier } from "@/lib/contributions";
import { formatCents } from "@/lib/money";

export type Choice = { frequency: Frequency; tier: Tier; amountCents: number };
export type AmountRules = { frequency: Frequency; limitCents: number };
export type CustomAmountResult = { cents: number | null; error: string | null };

// Dollars, optionally with a $ sign, thousands commas and up to two decimals.
// A trailing dot is allowed so "35." does not error while someone types.
const DOLLARS_RE = /^\$?\s*(\d{1,3}(,\d{3})*|\d+)(\.(\d*))?$/;

/**
 * Parse what someone typed. Empty means nothing chosen (no error); anything
 * that is not a dollar amount, or is below the online minimum or above the
 * yearly (or monthly) maximum, comes back with the message to show.
 */
export function parseCustomAmount(text: string, rules: AmountRules): CustomAmountResult {
  const trimmed = text.trim();
  if (trimmed === "") return { cents: null, error: null };
  const m = DOLLARS_RE.exec(trimmed);
  if (!m) return { cents: null, error: "Enter an amount in dollars, like 35." };
  const fraction = m[4] ?? "";
  if (fraction.length > 2) return { cents: null, error: "Enter dollars and cents, like 35 or 35.50." };
  const dollars = Number(m[1].replace(/,/g, ""));
  const cents = dollars * 100 + Number((fraction + "00").slice(0, 2));
  if (cents < MIN_DONATION_CENTS) return { cents, error: `The smallest contribution we can take online is ${formatCents(MIN_DONATION_CENTS)}.` };
  const max = starClubCents(rules.frequency, rules.limitCents);
  if (cents > max) {
    return {
      cents,
      error:
        rules.frequency === "monthly"
          ? `The most you can give monthly is ${formatCents(max)} a month (${formatCents(rules.limitCents)} a year under BC law).`
          : `The most you can give is ${formatCents(rules.limitCents)} a year under BC law.`,
    };
  }
  return { cents, error: null };
}

/** The choice after typing in the custom box: always the standard tier; an unparseable amount selects nothing (0). */
export function applyCustomAmount(choice: Choice, text: string, rules: AmountRules): Choice {
  const { cents } = parseCustomAmount(text, rules);
  return { frequency: choice.frequency, tier: "standard", amountCents: cents ?? 0 };
}

/** A preset button shows as pressed only while the custom box is empty. */
export function presetPressed(choice: Choice, presetCents: number, customText: string): boolean {
  return customText.trim() === "" && choice.tier === "standard" && choice.amountCents === presetCents;
}
