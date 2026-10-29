import type { NextRequest } from "next/server";
import { error, json, parseBody } from "@/lib/server/api";
import { productsForCheckout } from "@/lib/server/content";
import { handle, refused } from "@/lib/server/handle";
import { returnTo, write } from "@/lib/starbase";
import { cartSchema } from "@/lib/validation";

// The cart → Starbase's store checkout: priced there, never here; a sold-out
// item is refused there; Stripe Checkout back to /shop/thanks. Starbase's
// webhook marks the order paid and takes the items out of stock.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = await parseBody(req, cartSchema, "shop");
    if (!parsed.ok) return parsed.response;
    const { products, store } = await productsForCheckout();
    if (!store.open) return error("The shop opens soon. Please check back.", 503);
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const items = [];
    for (const it of parsed.data.items) {
      const p = bySlug.get(it.slug);
      if (!p) return error("Some items in your cart are no longer available. Please refresh the page.", 422);
      items.push({ product_id: p.id, variant: p.variants[0]?.label ?? "", qty: it.quantity });
    }
    const way = store.ways.find((w) => w.code === "ship") ?? store.ways[0];
    const r = await write<{ url?: string; order_id?: string }>("/site/store/checkout", {
      items, fulfilment: way?.code ?? "ship", return: returnTo("/shop/thanks", "/shop"),
    });
    if (r.status !== 200 || !r.data.url) return refused(r.data, r.status);
    return json({ url: r.data.url });
  });
}
