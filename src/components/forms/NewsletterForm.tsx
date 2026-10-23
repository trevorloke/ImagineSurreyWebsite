"use client";

import { useState } from "react";
import { Honeypot } from "./Field";
import { useApiForm } from "./useApiForm";

export function NewsletterForm({ source = "website" }: { source?: string }) {
  const { submit, pending, error } = useApiForm("/api/newsletter");
  const [done, setDone] = useState(false);

  if (done) return <p role="status" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>You&apos;re subscribed. Watch your inbox.</p>;

  return (
    <form
      className="newsletter-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (await submit({ email: data.get("email"), website: data.get("website"), source })) setDone(true);
      }}
    >
      <Honeypot />
      <input id="nl-email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" className="input" aria-invalid={error ? true : undefined} />
      <button type="submit" className="btn btn--navy" disabled={pending}>
        {pending ? "…" : "Subscribe"}
      </button>
      {error && (
        <p className="field-error" role="alert" style={{ flexBasis: "100%" }}>
          {error}
        </p>
      )}
    </form>
  );
}
