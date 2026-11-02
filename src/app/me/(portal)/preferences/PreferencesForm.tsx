"use client";

import { useActionState } from "react";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Checkbox, SelectField, TextField } from "@/components/forms/Field";
import { CONSENT_WORDING } from "@/lib/consent-wording";
import { LOCALES } from "@/lib/engagement";
import { savePreferences } from "./actions";

export type PreferenceValues = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  postalCode: string | null;
  neighbourhood: string | null;
  locale: string | null;
  emailUpdates: boolean;
  texts: boolean;
};

export function PreferencesForm({ person }: { person: PreferenceValues }) {
  const [state, action, pending] = useActionState(savePreferences, null);
  return (
    <form action={action} className="form-card" aria-busy={pending}>
      <Notice state={state} />
      <div className="form-row">
        <TextField id="pref-first" name="firstName" label="First name" defaultValue={person.firstName ?? ""} autoComplete="given-name" maxLength={80} error={fieldError(state, "firstName")} />
        <TextField id="pref-last" name="lastName" label="Last name" defaultValue={person.lastName ?? ""} autoComplete="family-name" maxLength={80} error={fieldError(state, "lastName")} />
      </div>
      <div className="form-row">
        <TextField id="pref-phone" name="phone" type="tel" label="Phone" defaultValue={person.phone ?? ""} autoComplete="tel" maxLength={30} error={fieldError(state, "phone")} />
        <TextField id="pref-postal" name="postalCode" label="Postal code" defaultValue={person.postalCode ?? ""} placeholder="A1A 1A1" autoComplete="postal-code" maxLength={10} error={fieldError(state, "postalCode")} />
      </div>
      <p className="hint">{person.neighbourhood ? `Your town centre: ${person.neighbourhood}.` : "We work out your town centre from your postal code, so we can tell you what's happening nearby."}</p>
      <SelectField id="pref-locale" name="locale" label="Language for emails and texts" defaultValue={person.locale ?? "en"} error={fieldError(state, "locale")}>
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.label}
          </option>
        ))}
      </SelectField>
      <fieldset className="group">
        <legend>How we can reach you</legend>
        <Checkbox name="updates" defaultChecked={person.emailUpdates} error={fieldError(state, "updates")}>
          <strong>Email me updates.</strong> {CONSENT_WORDING.updates}
        </Checkbox>
        <Checkbox name="sms" defaultChecked={person.texts} error={fieldError(state, "sms")}>
          <strong>Text me.</strong> {CONSENT_WORDING.sms}
        </Checkbox>
      </fieldset>
      <p className="hint">
        Signed in as {person.email}. To change your email address, write to us and we&apos;ll move your record over.
      </p>
      <div>
        <SubmitButton pendingText="Saving…">Save preferences</SubmitButton>
      </div>
    </form>
  );
}
