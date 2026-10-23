"use client";

import { useState } from "react";

export type FieldErrors = Record<string, string>;

/** POST JSON to one of our API routes and track pending, error and field-error state. */
export function useApiForm<TResult = { ok: true }>(url: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  async function submit(body: unknown): Promise<TResult | null> {
    setPending(true);
    setError(null);
    setFields({});
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setFields(data.fields ?? {});
        return null;
      }
      return data as TResult;
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { submit, pending, error, fields };
}

/** Read a form's named inputs, with checkboxes as booleans and grouped checkboxes as arrays. */
export function readForm(form: HTMLFormElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) || !el.name) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      if (el.dataset.group) {
        const list = (out[el.name] as string[] | undefined) ?? [];
        if (el.checked) list.push(el.value);
        out[el.name] = list;
      } else {
        out[el.name] = el.checked;
      }
    } else {
      out[el.name] = el.value;
    }
  }
  return out;
}
