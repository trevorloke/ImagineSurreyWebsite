import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { createDonationCheckout } from "@/lib/server/payments";
import { donationSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, donationSchema, "donations");
    if (!parsed.ok) return parsed.response;
    return json(await createDonationCheckout(getDb(), parsed.data));
  });
}
