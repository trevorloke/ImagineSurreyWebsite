import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { formatCents } from "@/lib/money";
import { completedSession } from "@/lib/server/checkout-session";

export const metadata: Metadata = { title: "Thank you", robots: { index: false } };

export default async function DonateThanks({ searchParams }: PageProps<"/donate/thanks">) {
  const session = await completedSession((await searchParams).session_id);
  const monthly = session?.mode === "subscription";
  return (
    <>
      <PageHead title="Thank you">
        {session?.amount_total
          ? `Your ${monthly ? "monthly " : ""}contribution of ${formatCents(session.amount_total)}${monthly ? " a month" : ""} is in. Stripe will email your receipt.`
          : "Your contribution is on its way. Stripe will email your receipt."}
      </PageHead>
      <section className="section">
        <div className="container stack" style={{ gap: 20, maxWidth: 760 }}>
          <p className="body">
            Contributions like yours pay for the work that wins: organizers, printing, and outreach in every town centre.
            {monthly && " Your monthly gift supports the Imagine Victory Fund, our war chest for the next election."}
          </p>
          <p className="body">The next most useful thing you can do is tell one neighbour about us.</p>
          <div className="btn-row">
            <Link href="/#join" className="btn btn--red btn--lg">
              Become a member
            </Link>
            <Link href="/" className="btn btn--outline btn--lg">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
