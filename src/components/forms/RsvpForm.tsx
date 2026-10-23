"use client";

import { useState } from "react";
import { Alert, Checkbox, Honeypot, TextField } from "./Field";
import { readForm, useApiForm } from "./useApiForm";

export function RsvpForm({ slug }: { slug: string }) {
  const { submit, pending, error, fields } = useApiForm(`/api/events/${slug}/rsvp`);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div role="status" className="success-card">
        <h3>You&apos;re on the list</h3>
        <p>See you there. Bring a neighbour.</p>
      </div>
    );
  }
  return (
    <form
      className="form-card"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = readForm(e.currentTarget);
        if (await submit({ ...data, guests: Number(data.guests) || 0 })) setDone(true);
      }}
    >
      <Honeypot />
      <h2 className="h3" style={{ fontSize: 26 }}>
        RSVP
      </h2>
      <TextField id="r-name" name="name" label="Your name" required autoComplete="name" error={fields.name} />
      <TextField id="r-email" name="email" type="email" label="Email" required autoComplete="email" error={fields.email} />
      <TextField id="r-guests" name="guests" type="number" min={0} max={10} defaultValue={0} label="Guests coming with you" style={{ maxWidth: 140 }} error={fields.guests} />
      <Checkbox name="newsletter">Send me the Imagine Surrey newsletter too.</Checkbox>
      {error && <Alert>{error}</Alert>}
      <button type="submit" className="btn btn--red btn--lg" disabled={pending}>
        {pending ? "One moment…" : "RSVP"}
      </button>
    </form>
  );
}
