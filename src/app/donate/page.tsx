import type { Metadata } from "next";
import { connection } from "next/server";
import { DonateForm } from "@/components/forms/DonateForm";
import type { Choice } from "@/components/forms/AmountPicker";
import { PageHead } from "@/components/PageHead";
import { Alert } from "@/components/forms/Field";
import { DEFAULT_CENTS, starClubCents } from "@/lib/contributions";
import { contributionLimitCents } from "@/lib/server/content";

export const metadata: Metadata = { title: "Chip in", description: "Contribute to Imagine Surrey, one-time or monthly." };

export default async function DonatePage({ searchParams }: PageProps<"/donate">) {
  await connection();
  const sp = await searchParams;
  const frequency = sp.frequency === "monthly" ? "monthly" : "one_time";
  const tier = sp.tier === "star" || sp.tier === "superstar" ? sp.tier : "standard";
  const amount = Number(sp.amount);
  const limitCents = await contributionLimitCents();
  const initial: Choice = {
    frequency,
    tier,
    amountCents:
      tier === "standard"
        ? Number.isInteger(amount) && amount > 0
          ? amount
          : DEFAULT_CENTS[frequency]
        : starClubCents(frequency, limitCents) * (tier === "superstar" ? 2 : 1),
  };

  return (
    <>
      <PageHead title="Chip in">
        In BC, elector organizations can only take contributions from individuals. No corporate money, no union money. Imagine Surrey runs on Surrey
        residents who give what they can.
      </PageHead>
      <section className="section">
        <div className="container split">
          <div className="stack" style={{ flex: "1 1 320px", gap: 16 }}>
            {sp.cancelled && <Alert tone="note">Your payment was cancelled and you haven&apos;t been charged. You can try again whenever you&apos;re ready.</Alert>}
            {sp.pledged && <Alert tone="note">Your pledge is recorded.</Alert>}
            <h2 className="h3" style={{ fontSize: 26 }}>
              Where your money goes
            </h2>
            <p className="body">Organizers, printing, outreach in every town centre, and keeping the lights on.</p>
            <h2 className="h3" style={{ fontSize: 26, marginTop: 12 }}>
              Who can give
            </h2>
            <p className="body">
              Contributions must come from an individual who lives in BC and is a Canadian citizen or permanent resident, using their own money. The
              annual limit is set by BC&apos;s Local Elections Campaign Financing Act. Membership fees count toward it. Contributions aren&apos;t tax deductible.
            </p>
            <p className="body">
              If a payment ever takes you over the annual limit, we return the extra automatically.
            </p>
          </div>
          <DonateForm initial={initial} limitCents={limitCents} />
        </div>
      </section>
    </>
  );
}
