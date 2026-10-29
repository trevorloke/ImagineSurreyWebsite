import type { NextRequest } from "next/server";
import { normalizePostalCode } from "@/lib/neighbourhoods";
import { json, parseBody } from "@/lib/server/api";
import { handle, refused } from "@/lib/server/handle";
import { write } from "@/lib/starbase";
import { signatureSchema } from "@/lib/validation";

// Petitions and pledges → Starbase's petitions, by slug (Outreach →
// Petitions: *Load the website's petitions* makes both, with the slugs in
// validation.ts CAMPAIGNS). Signing twice is harmless there. The signer
// joins the newsletter list: the form asks for that consent. The SkyTrain
// form's answer (where the line should end) stays with the signature.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, signatureSchema, "signatures");
    if (!parsed.ok) return parsed.response;
    const { campaign, firstName, lastName, email, address, phone, answer } = parsed.data;
    const postal = normalizePostalCode(parsed.data.postalCode);
    const r = await write("/signup", {
      kind: "petition", petition: campaign, name: `${firstName} ${lastName}`, email, phone,
      address: [address, postal].filter(Boolean).join(", "), subscribe: true,
      ...(answer ? { answer } : {}),
    });
    if (r.status !== 200) return refused(r.data, r.status);
    return json({ ok: true });
  });
}
