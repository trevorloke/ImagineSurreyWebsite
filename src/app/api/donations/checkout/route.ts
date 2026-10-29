import type { NextRequest } from "next/server";
import { slateAmountsFor } from "@/lib/contributions";
import { env } from "@/lib/env";
import { normalizePostalCode } from "@/lib/neighbourhoods";
import { json, parseBody } from "@/lib/server/api";
import { handle, refused } from "@/lib/server/handle";
import { returnTo, write } from "@/lib/starbase";
import { donationSchema } from "@/lib/validation";

// The donate form → Starbase's donate endpoint: the same eligibility
// checks and annual-limit check (per slate) as its own page, a pledge on
// its books for each slate, and Stripe Checkout back to /donate/thanks.
// Starbase's webhook books each payment as a gift per slate (and refunds
// in Stripe are mirrored there). The Superstar Club is the maximum to both
// slates: two contributions, one payment.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, donationSchema, "donations");
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const amounts = slateAmountsFor(d.tier, d.frequency, d.amountCents, env.contributionLimitCents);
    const r = await write<{ url?: string; ok?: boolean; pledged?: boolean }>("/donate", {
      amounts, monthly: d.frequency === "monthly",
      first_name: d.firstName, last_name: d.lastName, email: d.email, phone: d.phone,
      address: d.address, city: d.city, postal: normalizePostalCode(d.postalCode),
      attest: { individual: d.attestCitizenOrPR, resident: d.attestBcResident, own_funds: d.attestOwnFunds },
      subscribe: d.newsletter, return: returnTo("/donate/thanks", `/donate?frequency=${d.frequency}&cancelled=1`),
    });
    if (r.status !== 200) return refused(r.data, r.status);
    if (r.data.url) return json({ url: r.data.url });
    // No card payment connected yet: the pledge is recorded; the campaign follows up.
    return json({ url: `${env.siteUrl}/donate/thanks?pledged=1` });
  });
}
