import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { campaignSignatures } from "@/lib/db/schema";
import { normalizePostalCode } from "@/lib/neighbourhoods";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { subscribe } from "@/lib/server/newsletter";
import { upsertPerson } from "@/lib/server/people";
import { signatureSchema } from "@/lib/validation";

// Petitions and pledges. Signing twice is harmless: the first signature stands.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, signatureSchema, "signatures");
    if (!parsed.ok) return parsed.response;
    const { campaign, firstName, lastName, email, address, phone, answer } = parsed.data;
    const postalCode = normalizePostalCode(parsed.data.postalCode);
    const db = getDb();
    const person = await upsertPerson(db, email, { firstName, lastName, postalCode, address, phone, contactConsentAt: new Date() });
    await db
      .insert(campaignSignatures)
      .values({ campaign, personId: person.id, firstName, lastName, email, postalCode, address, phone, answer })
      .onConflictDoNothing();
    await subscribe(db, email, campaign, person.id);
    return json({ ok: true });
  });
}
