"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import { Alert } from "./forms/Field";
import { useApiForm } from "./forms/useApiForm";

export type ShopProduct = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  tileLabel: string;
  tileBackground: string;
  tileForeground: string;
};

const STORAGE_KEY = "imagine-surrey-cart";

export function Cart({ products }: { products: ShopProduct[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const { submit, pending, error } = useApiForm<{ url: string }>("/api/shop/checkout");

  // Remember the cart between visits on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (saved && typeof saved === "object") setQty(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(qty));
    } catch {}
  }, [qty]);

  const set = (slug: string, n: number) => setQty((q) => ({ ...q, [slug]: Math.max(0, Math.min(50, n)) }));
  const lines = products.filter((p) => (qty[p.slug] ?? 0) > 0);
  const count = lines.reduce((n, p) => n + qty[p.slug], 0);
  const total = lines.reduce((sum, p) => sum + p.priceCents * qty[p.slug], 0);

  async function checkout() {
    const result = await submit({ items: lines.map((p) => ({ slug: p.slug, quantity: qty[p.slug] })) });
    if (result) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      window.location.assign(result.url);
    }
  }

  return (
    <>
      <div className="products">
        {products.map((p) => {
          const n = qty[p.slug] ?? 0;
          return (
            <article key={p.slug} className="product">
              <div className="product-tile" style={{ background: p.tileBackground, color: p.tileForeground }}>
                {p.tileLabel}
              </div>
              <div className="product-meta">
                <h3>{p.name}</h3>
                <span className="price">{formatCents(p.priceCents)}</span>
              </div>
              {p.description && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "var(--muted)" }}>{p.description}</p>}
              <div className="qty" role="group" aria-label={`Quantity of ${p.name}`}>
                <button type="button" className="qty-btn" onClick={() => set(p.slug, n - 1)} disabled={n === 0} aria-label={`Remove one ${p.name}`}>
                  −
                </button>
                <span aria-live="polite" style={{ fontWeight: 800, fontSize: 18 }}>
                  {n}
                </span>
                <button type="button" className="qty-btn" onClick={() => set(p.slug, n + 1)} aria-label={`Add one ${p.name}`}>
                  +
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {error && <Alert>{error}</Alert>}
      {count > 0 && (
        <div className="cart-bar">
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            {count} {count === 1 ? "item" : "items"} · {formatCents(total)}
          </span>
          <button type="button" className="btn btn--yellow btn--lg" onClick={checkout} disabled={pending}>
            {pending ? "Opening checkout…" : "Check out"}
          </button>
        </div>
      )}
    </>
  );
}
