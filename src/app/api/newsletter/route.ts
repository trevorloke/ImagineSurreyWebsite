import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { subscribe } from "@/lib/server/newsletter";
import { newsletterSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, newsletterSchema, "newsletter");
    if (!parsed.ok) return parsed.response;
    await subscribe(getDb(), parsed.data.email, parsed.data.source ?? "website");
    return json({ ok: true });
  });
}
