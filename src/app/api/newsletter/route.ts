import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { subscribe } from "@/lib/server/newsletter";
import { newsletterSchema } from "@/lib/validation";

// Returns { ok: true, status } where status is:
//   "pending"      – a confirmation email is on its way (double opt-in)
//   "subscribed"   – on the list now (email not configured, or already confirmed)
//   "unsubscribed" – this address opted out earlier and stays opted out (nothing was sent)
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, newsletterSchema, "newsletter");
    if (!parsed.ok) return parsed.response;
    const status = await subscribe(getDb(), parsed.data.email, parsed.data.source ?? "website");
    return json({ ok: true, status });
  });
}
