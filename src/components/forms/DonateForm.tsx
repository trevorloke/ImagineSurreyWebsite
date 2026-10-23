"use client";

import { useState } from "react";
import { MIN_DONATION_CENTS } from "@/lib/contributions";
import { formatCents } from "@/lib/money";
import { AmountPicker, choiceLabel, type Choice } from "./AmountPicker";
import { Alert, Checkbox, Honeypot, TextField } from "./Field";
import { readForm, useApiForm } from "./useApiForm";

export function DonateForm({ initial, limitCents }: { initial: Choice; limitCents: number }) {
  const [choice, setChoice] = useState<Choice>(initial);
  const { submit, pending, error, fields } = useApiForm<{ url: string }>("/api/donations/checkout");
  const tooSmall = choice.tier === "standard" && choice.amountCents < MIN_DONATION_CENTS;

  return (
    <form
      className="donate-card"
      style={{ flex: "1 1 520px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (tooSmall) return;
        const result = await submit({ ...readForm(e.currentTarget), ...choice });
        if (result) window.location.assign(result.url);
      }}
    >
      <Honeypot />
      <AmountPicker choice={choice} onChange={setChoice} limitCents={limitCents} allowCustom />
      {tooSmall && <p className="field-error">The smallest contribution we can take online is {formatCents(MIN_DONATION_CENTS)}.</p>}

      <fieldset className="group" style={{ gap: 14 }}>
        <legend style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>Your details</legend>
        <p className="hint" style={{ margin: "-4px 0 0" }}>
          BC law requires us to record the name and address of everyone who contributes.
        </p>
        <div className="form-row">
          <TextField id="d-first" name="firstName" label="First name" required autoComplete="given-name" error={fields.firstName} />
          <TextField id="d-last" name="lastName" label="Last name" required autoComplete="family-name" error={fields.lastName} />
        </div>
        <div className="form-row">
          <TextField id="d-email" name="email" type="email" label="Email" required autoComplete="email" error={fields.email} />
          <TextField id="d-phone" name="phone" type="tel" label="Phone (optional)" autoComplete="tel" error={fields.phone} />
        </div>
        <TextField id="d-address" name="address" label="Street address" required autoComplete="street-address" error={fields.address} />
        <div className="form-row">
          <TextField id="d-city" name="city" label="City" required defaultValue="Surrey" autoComplete="address-level2" error={fields.city} />
          <TextField id="d-postal" name="postalCode" label="Postal code" required placeholder="V3T 1A1" autoComplete="postal-code" error={fields.postalCode} />
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>I confirm that</legend>
        <Checkbox name="attestCitizenOrPR" required error={fields.attestCitizenOrPR}>
          I&apos;m a Canadian citizen or permanent resident
        </Checkbox>
        <Checkbox name="attestBcResident" required error={fields.attestBcResident}>
          I live in British Columbia
        </Checkbox>
        <Checkbox name="attestOwnFunds" required error={fields.attestOwnFunds}>
          This contribution is my own money, and no one will pay me back for it
        </Checkbox>
      </fieldset>
      <Checkbox name="newsletter" defaultChecked>
        Send me the Imagine Surrey newsletter. I can unsubscribe anytime.
      </Checkbox>

      {error && <Alert>{error}</Alert>}
      <button type="submit" className="btn btn--red btn--xl btn--block" disabled={pending || tooSmall}>
        {pending ? "Taking you to secure checkout…" : `Donate ${choiceLabel(choice, limitCents)}`}
      </button>
      <p className="small">
        You&apos;ll pay securely with Stripe. {choice.frequency === "monthly" && "You can cancel a monthly gift anytime by emailing us. "}Contributions can&apos;t
        exceed {formatCents(limitCents)} a year under BC&apos;s Local Elections Campaign Financing Act, and aren&apos;t tax deductible.
      </p>
    </form>
  );
}
