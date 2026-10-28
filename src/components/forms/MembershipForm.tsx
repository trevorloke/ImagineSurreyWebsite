"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/content/site";
import { formatCents } from "@/lib/money";
import { ageOn, CAMPUSES, MIN_MEMBER_AGE, NEIGHBOURHOODS, neighbourhoodForPostalCode, OUTSIDE_SURREY } from "@/lib/neighbourhoods";
import { Alert, Checkbox, Honeypot, SelectField, TextField } from "./Field";
import { readForm, useApiForm } from "./useApiForm";

const LANGUAGES: [string, string?, string?][] = [
  ["English"],
  ["Punjabi", "ਪੰਜਾਬੀ", "pa"],
  ["Hindi", "हिन्दी", "hi"],
  ["Urdu", "اردو", "ur"],
  ["Mandarin", "普通话", "zh"],
  ["Cantonese", "廣東話", "yue"],
  ["Filipino"],
  ["Korean", "한국어", "ko"],
  ["Vietnamese", "Tiếng Việt", "vi"],
  ["Arabic", "العربية", "ar"],
  ["Farsi", "فارسی", "fa"],
  ["Gujarati", "ગુજરાતી", "gu"],
  ["Spanish", "Español", "es"],
  ["French", "Français", "fr"],
  ["Other", "Another language"],
];

const ISSUES = ["Safer streets", "Faster commutes", "Smarter investments", "Lower costs", "Stronger services", "Homes I can afford"];

type Result = { status: "checkout"; url: string } | { status: "active" } | { status: "pledged"; instructions?: string } | { status: "already_member"; expiresAt: string };

export function MembershipForm({ feeCents }: { feeCents: number }) {
  const { submit, pending, error, fields } = useApiForm<Result>("/api/membership");
  const [hood, setHood] = useState("");
  const [outsideSurrey, setOutsideSurrey] = useState(false);
  const [tooYoung, setTooYoung] = useState(false);
  const [notEligible, setNotEligible] = useState(false);
  const [student, setStudent] = useState(false);
  const [done, setDone] = useState<Result | null>(null);
  const blocked = tooYoung || (notEligible && feeCents > 0);

  if (done?.status === "active" || done?.status === "already_member" || done?.status === "pledged") {
    return (
      <div role="status" className="success-card">
        <h3>{done.status === "active" ? "Welcome to Imagine Surrey" : done.status === "pledged" ? "Thanks for joining" : "You're already a member"}</h3>
        <p>
          {done.status === "active"
            ? "Thanks for joining. Watch your inbox for a note from us."
            : done.status === "pledged"
              ? (done.instructions ?? "We'll be in touch to complete your membership fee by e-transfer or cheque.")
              : `Your membership runs until ${new Date(done.expiresAt).toLocaleDateString("en-CA", { dateStyle: "long" })}. We've updated your details.`}{" "}
          Two things make the biggest difference right now: <Link href="/donate">chip in</Link> if you can, and tell one neighbour about us.
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blocked) return;
    const result = await submit(readForm(e.currentTarget));
    if (!result) return;
    if (result.status === "checkout") window.location.assign(result.url);
    else setDone(result);
  }

  return (
    <form className="form-card" onSubmit={onSubmit} noValidate={false}>
      <Honeypot />
      <div className="form-row">
        <TextField id="m-first" name="firstName" label="First name" required autoComplete="given-name" error={fields.firstName} />
        <TextField id="m-last" name="lastName" label="Last name" required autoComplete="family-name" error={fields.lastName} />
      </div>
      <div className="form-row">
        <TextField id="m-email" name="email" type="email" label="Email" required autoComplete="email" error={fields.email} />
        <TextField id="m-phone" name="phone" type="tel" label="Phone (optional)" autoComplete="tel" error={fields.phone} />
      </div>
      <div className="form-row form-row--address">
        <TextField
          id="m-address"
          name="address"
          label="Street address"
          required
          autoComplete="street-address"
          placeholder="Start typing your address"
          inputClassName="input--search"
          error={fields.address}
        />
        <TextField
          id="m-city"
          name="city"
          label="City"
          required
          defaultValue="Surrey"
          autoComplete="address-level2"
          error={fields.city}
          onChange={(e) => {
            const city = e.target.value.trim().toLowerCase();
            const outside = city !== "" && city !== "surrey";
            setOutsideSurrey(outside);
            if (outside) setHood(OUTSIDE_SURREY);
            else if (hood === OUTSIDE_SURREY) setHood("");
          }}
        />
      </div>
      {outsideSurrey && (
        <Alert tone="note">
          <strong>You live outside Surrey.</strong> You&apos;re welcome to join and help, but members who live outside Surrey don&apos;t have voting rights
          at member meetings.
        </Alert>
      )}
      <div className="form-row">
        <TextField
          id="m-postal"
          name="postalCode"
          label="Postal code"
          required
          placeholder="A1A 1A1"
          autoComplete="postal-code"
          error={fields.postalCode}
          onChange={(e) => {
            const match = neighbourhoodForPostalCode(e.target.value);
            if (match) setHood(match);
          }}
        />
        <SelectField
          id="m-hood"
          name="neighbourhood"
          label="Neighbourhood"
          required
          value={hood}
          error={fields.neighbourhood}
          onChange={(e) => {
            setHood(e.target.value);
            setOutsideSurrey(e.target.value === OUTSIDE_SURREY);
          }}
        >
          <option value="">Choose one</option>
          {NEIGHBOURHOODS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value={OUTSIDE_SURREY}>I live outside Surrey</option>
        </SelectField>
      </div>
      <p className="hint">Every member joins their neighbourhood committee automatically, so you&apos;ll hear about meetings close to home.</p>

      <fieldset className="group">
        <legend>About you</legend>
        <TextField
          id="m-dob"
          name="birthdate"
          type="date"
          label="Date of birth"
          required
          autoComplete="bday"
          style={{ maxWidth: 260 }}
          error={fields.birthdate}
          onChange={(e) => {
            const age = ageOn(e.target.value, new Date());
            setTooYoung(age !== undefined && age < MIN_MEMBER_AGE);
          }}
        />
        {tooYoung && (
          <Alert>
            <strong>Members must be {MIN_MEMBER_AGE} or older.</strong> You can&apos;t join yet, but you can still <a href="#newsletter">get the newsletter</a>{" "}
            and follow along.
          </Alert>
        )}
        <SelectField
          id="m-status"
          name="citizenshipStatus"
          label="Are you a Canadian citizen or permanent resident?"
          required
          defaultValue=""
          style={{ maxWidth: 360 }}
          error={fields.citizenshipStatus}
          onChange={(e) => setNotEligible(e.target.value === "Other")}
        >
          <option value="">Choose one</option>
          <option value="Citizen">Canadian citizen</option>
          <option value="Permanent resident">Permanent resident</option>
          <option value="Other">Something else</option>
        </SelectField>
        {notEligible && feeCents > 0 && (
          <Alert>
            <strong>We can&apos;t take a membership fee from you.</strong> Under BC election law, only Canadian citizens and permanent residents who live in BC
            can make contributions, and membership fees count as contributions. You can still <a href="#newsletter">get the newsletter</a>, come to events,
            and volunteer.
          </Alert>
        )}
        <div className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <SelectField id="m-gender" name="gender" label="Gender" defaultValue="">
            <option value="">Choose one</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </SelectField>
          <div className="field">
            <span className="field-label">Languages you speak</span>
            <details className="dropdown">
              <summary className="input">
                Choose all that apply<span aria-hidden="true">▾</span>
              </summary>
              <div className="dropdown-panel">
                {LANGUAGES.map(([value, native, lang]) => (
                  <label key={value} className="check">
                    <input type="checkbox" name="languages" value={value} data-group="true" />
                    {value === "Other" ? (
                      <span>{native}</span>
                    ) : native ? (
                      <span>
                        {value} · <span lang={lang} dir="auto">{native}</span>
                      </span>
                    ) : (
                      <span>{value}</span>
                    )}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>
        <Checkbox name="student" onChange={(e) => setStudent(e.currentTarget.checked)}>
          I&apos;m a student and I&apos;d like to join a campus club
        </Checkbox>
        {student && (
          <SelectField id="m-campus" name="campus" label="Which campus?" defaultValue="">
            <option value="">Choose one</option>
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        )}
      </fieldset>

      <TextField id="m-issue" name="issue" label="What's one thing that you imagine for Surrey?" list="m-issue-options" placeholder="Pick one or type your own" />
      <datalist id="m-issue-options">
        {ISSUES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>

      <fieldset className="group">
        <legend>I&apos;m interested in</legend>
        <Checkbox name="interestVolunteer">Volunteering</Checkbox>
        <Checkbox name="interestLawnSign">A lawn sign, when the time comes</Checkbox>
      </fieldset>
      <Checkbox name="consent" required error={fields.consent}>
        Yes, Imagine Surrey can contact me by email and text about news, events, and ways to help. I can unsubscribe anytime.
      </Checkbox>

      {error && <Alert>{error}</Alert>}
      <button type="submit" className="btn btn--red btn--lg btn--block" disabled={blocked || pending} aria-disabled={blocked || pending}>
        {pending ? "One moment…" : feeCents > 0 ? `Join Imagine Surrey · ${formatCents(feeCents)} a year` : "Join Imagine Surrey"}
      </button>
      <p className="small">
        {feeCents > 0 && "You'll pay securely with Stripe. Membership fees count as contributions under BC election law and aren't tax deductible. "}
        Your details stay with Imagine Surrey. Read our <a href={site.privacyUrl}>privacy policy</a>.
      </p>
    </form>
  );
}
