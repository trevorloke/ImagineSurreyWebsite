import type { NextRequest } from "next/server";
import { json, parseBody } from "@/lib/server/api";
import { handle, refused } from "@/lib/server/handle";
import { write } from "@/lib/starbase";
import { rsvpSchema } from "@/lib/validation";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[slug]/rsvp">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const parsed = await parseBody(req, rsvpSchema, "rsvp");
    if (!parsed.ok) return parsed.response;
    const { name, email, guests, newsletter } = parsed.data;
    const r = await write("/signup", { kind: "rsvp", event: slug, name, email, guests });
    if (r.status !== 200) return refused(r.data, r.status);
    if (newsletter) await write("/signup", { kind: "newsletter", email, name });
    return json({ ok: true });
  });
}
