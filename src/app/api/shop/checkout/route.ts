import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/server/api";
import { handle } from "@/lib/server/handle";
import { createOrderCheckout } from "@/lib/server/payments";
import { cartSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, cartSchema, "shop");
    if (!parsed.ok) return parsed.response;
    return json(await createOrderCheckout(getDb(), parsed.data));
  });
}
