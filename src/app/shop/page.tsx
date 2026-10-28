import type { Metadata } from "next";
import { Cart } from "@/components/Cart";
import { PageHead } from "@/components/PageHead";
import { activeProducts } from "@/lib/server/content";

export const metadata: Metadata = { title: "Shop", description: "Lawn signs, shirts, buttons and more from Imagine Surrey." };

export default async function ShopPage() {
  const { products, store } = await activeProducts();
  return (
    <>
      <PageHead title="Get the merch">Lawn signs, shirts, and buttons. Choose what you&apos;d like and check out securely with Stripe. We ship across Canada.</PageHead>
      <section className="section section--surface">
        <div className="container stack" style={{ gap: 24 }}>
          {products.length === 0 ? (
            <p className="empty-state">The shop is restocking. Check back soon.</p>
          ) : (
            <Cart products={products} open={store.open} />
          )}
        </div>
      </section>
    </>
  );
}
