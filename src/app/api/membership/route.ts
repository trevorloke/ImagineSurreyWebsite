import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { createMembership, splitPublicFormExtras } from "@/lib/server/payments";
import { membershipSchema } from "@/lib/validation";

/**
 * Responds with {status:"checkout",url} or {status:"received"} and nothing
 * else: it never says whether the email already belongs to a member.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { request, extras } = await splitPublicFormExtras(req);
    const parsed = await parseBody(request, membershipSchema, "membership");
    if (!parsed.ok) return parsed.response;
    return json(await createMembership(getDb(), parsed.data, extras));
  });
}
