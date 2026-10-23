import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { completedSession } from "@/lib/server/checkout-session";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function Welcome({ searchParams }: PageProps<"/join/welcome">) {
  const session = await completedSession((await searchParams).session_id);
  return (
    <>
      <PageHead title="Welcome to Imagine Surrey">
        {session ? "Your membership is paid and active. Stripe will email your receipt." : "Thanks for joining. Watch your inbox for a note from us."}
      </PageHead>
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
