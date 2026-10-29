import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };

export default function ShopThanks() {
  return (
    <>
      <PageHead title="Order received">Thanks! We&apos;ve received your order. Stripe will email your receipt, and we&apos;ll be in touch when it ships.</PageHead>
      <section className="section">
        <div className="container btn-row">
          <Link href="/" className="btn btn--outline btn--lg">
            Back to home
          </Link>
        </div>
      </section>
    </>
  );
}
