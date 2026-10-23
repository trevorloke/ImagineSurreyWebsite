import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { createMembership } from "@/lib/server/payments";
import { membershipSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, membershipSchema, "membership");
    if (!parsed.ok) return parsed.response;
    return json(await createMembership(getDb(), parsed.data));
  });
}
