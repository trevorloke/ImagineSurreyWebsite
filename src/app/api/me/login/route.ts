import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { memberMagicLinkEmail } from "@/lib/email/messages";
import { safeMemberNext } from "@/lib/engagement";
import { env } from "@/lib/env";
import { error, json, parseBody, rateLimited } from "@/lib/server/api";
import { sendEmail } from "@/lib/server/email";
import { handle } from "@/lib/server/handle";
import { findPersonByEmail } from "@/lib/server/people";
import { getSettings } from "@/lib/server/settings";
import { createToken, tokenUrl } from "@/lib/server/tokens";

const LINK_MINUTES = 30;

const schema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
    next: z.string().max(500).optional(),
    website: z.string().max(0).optional(),
  })
  .strict();

/**
 * Ask for a sign-in link. The answer is {ok:true} whether or not the address
 * has an account, so the form can't be used to find out who is a supporter.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    // Five requests a minute per address: tighter than the usual form limit.
    if (rateLimited(req, "member-login", 5)) return error("Too many requests. Please wait a minute and try again.", 429);
    const parsed = await parseBody(req, schema, "member-login-body");
    if (!parsed.ok) return parsed.response;
    const { email } = parsed.data;
    const next = safeMemberNext(parsed.data.next);
    const db = getDb();
    const person = await findPersonByEmail(db, email);
    if (person) {
      const raw = await createToken(db, "member-login", email, { ttlMinutes: LINK_MINUTES, data: { next } });
      const link = new URL(tokenUrl("/api/me/verify", raw));
      link.searchParams.set("next", next);
      const { org } = await getSettings();
      const message = memberMagicLinkEmail({ siteUrl: env.siteUrl, orgName: org.name, orgEmail: org.email }, link.toString(), LINK_MINUTES);
      await sendEmail(db, { to: email, kind: "member-magic-link", personId: person.id, ...message });
    }
    return json({ ok: true });
  });
}
