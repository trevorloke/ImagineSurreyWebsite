import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";

export const metadata: Metadata = { title: "Thank you", robots: { index: false } };

export default async function DonateThanks({ searchParams }: PageProps<"/donate/thanks">) {
  const sp = await searchParams;
  const pledged = sp.pledged === "1";
  return (
    <>
      <PageHead title="Thank you">
        {pledged
          ? "Your pledge is recorded. We'll be in touch to complete it by e-transfer or cheque."
          : "Your contribution is in. Stripe will email your payment receipt, and your official receipt follows from us."}
      </PageHead>
      <section className="section">
        <div className="container stack" style={{ gap: 20, maxWidth: 760 }}>
          <p className="body">Contributions like yours pay for the work that wins: organizers, printing, and outreach in every town centre.</p>
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
