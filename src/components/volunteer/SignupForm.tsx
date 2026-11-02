"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Checkbox, Honeypot, TextField } from "@/components/forms/Field";
import { readForm, useApiForm } from "@/components/forms/useApiForm";
import { trackingFromLocation } from "@/lib/share";
import type { PublicOpening, SignupConfirmation } from "@/lib/shifts";

type Result = { ok: true; confirmation: SignupConfirmation };

/**
 * One opening's sign-up form. Sends name, email, phone (optional), postal
 * code, the contact consent tick and the optional text-message tick, plus
 * the `source` and `ref` the page URL carried.
 */
export function SignupForm({ opening, onDone, onCancel }: { opening: PublicOpening; onDone: (c: SignupConfirmation) => void; onCancel: () => void }) {
  const { submit, pending, error, fields } = useApiForm<Result>("/api/volunteer/signup");
  const [tracking, setTracking] = useState<{ source?: string; ref?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = `su-${opening.id.slice(0, 8)}`;

  useEffect(() => setTracking(trackingFromLocation(window.location.search)), []);
  useEffect(() => formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(), []);

  // After a failed submit, focus goes to the first field with a problem, else the message.
  useEffect(() => {
    if (!error) return;
    const first = Object.keys(fields)[0];
    const el = first ? formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`) : null;
    (el ?? formRef.current?.querySelector<HTMLElement>("[role=alert]"))?.focus();
  }, [error, fields]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = readForm(e.currentTarget);
    const result = await submit({ ...data, openingId: opening.id });
    if (result) onDone(result.confirmation);
  }

  return (
    <form ref={formRef} className="opening-form" onSubmit={onSubmit} aria-label={`Sign up for ${opening.title}`}>
      <Honeypot />
      <input type="hidden" name="source" value={tracking.source ?? ""} />
      <input type="hidden" name="ref" value={tracking.ref ?? ""} />
      <h4>Sign up for this shift</h4>
      <div className="form-row">
        <TextField id={`${prefix}-name`} name="name" label="Your name" required autoComplete="name" maxLength={120} error={fields.name} />
        <TextField id={`${prefix}-email`} name="email" type="email" label="Email" required autoComplete="email" maxLength={254} error={fields.email} />
      </div>
      <div className="form-row">
        <TextField id={`${prefix}-phone`} name="phone" type="tel" label="Phone (optional)" autoComplete="tel" maxLength={30} error={fields.phone} />
        <TextField id={`${prefix}-postal`} name="postalCode" label="Postal code" required autoComplete="postal-code" placeholder="V3T 1V8" maxLength={7} error={fields.postalCode} />
      </div>
      <Checkbox name="consent" required error={fields.consent}>
        Imagine Surrey can email or call me about this shift and other ways to help. Unsubscribe anytime.
      </Checkbox>
      <Checkbox name="smsConsent" error={fields.smsConsent}>
        Text me a reminder too (standard rates apply; reply STOP to opt out).
      </Checkbox>
      {error && <Alert>{error}</Alert>}
      <div className="btn-row" style={{ gap: 10 }}>
        <button type="submit" className="btn btn--red" aria-busy={pending} aria-disabled={pending}>
          {pending ? "One moment…" : "Sign me up"}
        </button>
        <button type="button" className="btn btn--outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
