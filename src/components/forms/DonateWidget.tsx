"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_CENTS } from "@/lib/contributions";
import { formatCents } from "@/lib/money";
import { AmountPicker, choiceLabel, type Choice } from "./AmountPicker";

/** The home page "Chip in" card. Details and payment happen on /donate. */
export function DonateWidget({ limitCents }: { limitCents: number }) {
  const [choice, setChoice] = useState<Choice>({ frequency: "one_time", tier: "standard", amountCents: DEFAULT_CENTS.one_time });
  const href = `/donate?frequency=${choice.frequency}&tier=${choice.tier}&amount=${choice.amountCents}`;
  return (
    <div className="donate-card">
      <AmountPicker choice={choice} onChange={setChoice} limitCents={limitCents} />
      <Link href={href} className="btn btn--red btn--xl btn--block">
        Donate {choiceLabel(choice, limitCents)}
      </Link>
      <Link href="/donate" className="text-link" style={{ fontSize: 15, fontWeight: 600, alignSelf: "flex-start" }}>
        Choose another amount
      </Link>
      <p className="small">
        Contributions must come from an individual who lives in BC and is a Canadian citizen or permanent resident, and can&apos;t exceed the annual limit
        under BC&apos;s Local Elections Campaign Financing Act, currently {formatCents(limitCents)} a year. They aren&apos;t tax deductible.
      </p>
    </div>
  );
}
