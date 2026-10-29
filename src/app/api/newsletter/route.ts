import type { NextRequest } from "next/server";
import { json, parseBody } from "@/lib/server/api";
import { handle, refused } from "@/lib/server/handle";
import { write } from "@/lib/starbase";
import { newsletterSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, newsletterSchema, "newsletter");
    if (!parsed.ok) return parsed.response;
    const r = await write("/signup", { kind: "newsletter", email: parsed.data.email });
    if (r.status !== 200) return refused(r.data, r.status);
    return json({ ok: true });
  });
}
