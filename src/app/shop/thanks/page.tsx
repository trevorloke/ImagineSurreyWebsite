import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { formatCents } from "@/lib/money";
import { completedSession } from "@/lib/server/checkout-session";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };

export default async function ShopThanks({ searchParams }: PageProps<"/shop/thanks">) {
  const session = await completedSession((await searchParams).session_id);
  return (
    <>
      <PageHead title="Order received">
        {session?.amount_total ? `Thanks! We've received your order of ${formatCents(session.amount_total)}.` : "Thanks! We've received your order."} Stripe will
        email your receipt, and we&apos;ll be in touch when it ships.
      </PageHead>
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
