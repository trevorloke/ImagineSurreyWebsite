import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default function Welcome() {
  return (
    <>
      <PageHead title="Welcome to Imagine Surrey">Your membership is paid. Stripe will email your receipt, and we&apos;ll be in touch.</PageHead>
      <section className="section">
        <div className="container stack" style={{ gap: 20, maxWidth: 760 }}>
          <p className="body">
            You&apos;re now part of your neighbourhood committee, so you&apos;ll hear about meetings close to home. Two things make the biggest difference
            right now: chip in if you can, and tell one neighbour about us.
          </p>
          <div className="btn-row">
            <Link href="/donate" className="btn btn--red btn--lg">
              Chip in
            </Link>
            <Link href="/events" className="btn btn--outline btn--lg">
              See upcoming events
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
