import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { error, json, parseBody } from "@/lib/server/api";
import { invalidate, TAGS } from "@/lib/server/cache";
import { handle } from "@/lib/server/handle";
import { notifyShiftSignup } from "@/lib/server/notifications";
import { ensureReferralCode } from "@/lib/server/people";
import { withRef } from "@/lib/share";
import { openingGoogleUrl, signUpForOpening } from "@/lib/server/volunteer";
import { volunteerSignupSchema } from "@/lib/shift-validation";
import { formatLongDate, slotLabel, todayInSurrey, type SignupConfirmation } from "@/lib/shifts";

// One tap from "I'll come" to a booked shift: the person is created or filled
// in, the shift is booked against the opening, and the confirmation carries
// calendar links. The .ics file has no personal data, so its URL can be shared.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, volunteerSignupSchema, "volunteer-signup");
    if (!parsed.ok) return parsed.response;
    const { openingId, name, email, phone, postalCode, smsConsent, source, ref } = parsed.data;
    const db = getDb();
    const result = await signUpForOpening(db, { openingId, name, email, phone, postalCode, smsConsent, source, ref }, todayInSurrey());
    if (!result.ok) return error(result.message, result.status);

    try {
      await notifyShiftSignup(db, { shiftId: result.shiftId });
    } catch (err) {
      console.error("shift sign-up notification failed", err);
    }
    invalidate(TAGS.counters);

    // Their share link credits the people they bring in.
    let referralCode: string | null = null;
    try {
      referralCode = await ensureReferralCode(db, result.personId);
    } catch (err) {
      console.error("referral code allocation failed", err);
    }

    const { opening } = result;
    const siteUrl = env.siteUrl;
    const confirmation: SignupConfirmation = {
      openingId: opening.id,
      title: opening.title,
      date: opening.date,
      dateLabel: formatLongDate(opening.date, true),
      slot: opening.slot,
      slotLabel: slotLabel(opening.slot),
      location: opening.location,
      neighbourhood: opening.neighbourhood,
      googleUrl: openingGoogleUrl(opening, siteUrl),
      icsUrl: `${siteUrl}/volunteer/openings/${opening.id}.ics`,
      shareUrl: withRef(`${siteUrl}/volunteer`, referralCode),
      spotsLeft: result.spotsLeft,
    };
    return json({ ok: true, confirmation });
  });
}
