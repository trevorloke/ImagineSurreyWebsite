"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/content/site";
import type { CampaignSlug } from "@/lib/validation";
import { Alert, Checkbox, Honeypot, TextField } from "./Field";
import { readForm, useApiForm } from "./useApiForm";

/** The pledge (short) and the SkyTrain petition (with optional extras). */
export function SignatureForm({ campaign, variant }: { campaign: CampaignSlug; variant: "pledge" | "petition" }) {
  const { submit, pending, error, fields } = useApiForm("/api/signatures");
  const [done, setDone] = useState(false);
  const p = variant === "pledge" ? "pl" : "p";

  if (done) {
    return (
      <div role="status" className="success-card" style={{ flex: "1 1 380px" }}>
        <h3>{variant === "pledge" ? "You've signed the pledge" : "Your name is on the petition"}</h3>
        <p>
          Thanks. Tell a neighbour, and if you can, <Link href="/donate">chip in</Link>
          {variant === "petition" ? " to help us deliver it to City Hall." : " to help us hold City Hall to account."}
        </p>
      </div>
    );
  }

  return (
    <form
      className="form-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await submit({ ...readForm(e.currentTarget), campaign })) setDone(true);
      }}
    >
      <Honeypot />
      {variant === "petition" && <h3 style={{ margin: 0, fontWeight: 800, fontSize: 26, lineHeight: 1.15, color: "var(--navy)" }}>Add your name</h3>}
      <div className="form-row" style={variant === "pledge" ? { gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" } : undefined}>
        <TextField id={`${p}-first`} name="firstName" label="First name" required autoComplete="given-name" error={fields.firstName} />
        <TextField id={`${p}-last`} name="lastName" label="Last name" required autoComplete="family-name" error={fields.lastName} />
      </div>
      <div className="form-row" style={variant === "pledge" ? { gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" } : undefined}>
        {variant === "pledge" && <TextField id={`${p}-email`} name="email" type="email" label="Email" required autoComplete="email" error={fields.email} />}
        <TextField id={`${p}-postal`} name="postalCode" label="Postal code" required placeholder="A1A 1A1" autoComplete="postal-code" error={fields.postalCode} />
        {variant === "petition" && <TextField id={`${p}-email`} name="email" type="email" label="Email" required autoComplete="email" error={fields.email} />}
      </div>
      {variant === "petition" && (
        <>
          <div className="form-row">
            <TextField id="p-address" name="address" label="Street address (optional)" autoComplete="street-address" />
            <TextField id="p-phone" name="phone" type="tel" label="Phone (optional)" autoComplete="tel" />
          </div>
          <TextField id="p-street" name="answer" label="Where do you think the line should end? (optional)" placeholder="A station, street, or neighbourhood" />
        </>
      )}
      <Checkbox name="consent" required error={fields.consent}>
        Yes, Imagine Surrey can email me about this campaign and other news. I can unsubscribe anytime.
      </Checkbox>
      {error && <Alert>{error}</Alert>}
      <button type="submit" className="btn btn--red btn--lg" style={{ minHeight: variant === "petition" ? 56 : 54, fontSize: 19 }} disabled={pending}>
        {pending ? "One moment…" : variant === "pledge" ? "Sign the pledge" : "Add my name"}
      </button>
      {variant === "petition" && (
        <p className="small">
          We&apos;ll deliver the names to City Hall. Your details stay with Imagine Surrey. Read our <a href={site.privacyUrl}>privacy policy</a>.
        </p>
      )}
    </form>
  );
}
