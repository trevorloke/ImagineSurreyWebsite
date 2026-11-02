"use client";

import { useActionState } from "react";
import { fieldError, Notice } from "@/components/admin/Notice";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Checkbox, SelectField, TextField } from "@/components/forms/Field";
import { CAMPUSES, NEIGHBOURHOODS, OUTSIDE_SURREY } from "@/lib/neighbourhoods";
import type { ActionState } from "@/lib/server/actions";
import { LOCALES } from "./query";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

export type PersonFormValues = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  neighbourhood: string | null;
  birthdate: string | null;
  citizenshipStatus: string | null;
  gender: string | null;
  languages: string[] | null;
  student: boolean;
  campus: string | null;
  issue: string | null;
  interestVolunteer: boolean;
  interestLawnSign: boolean;
  locale: string | null;
  source: string | null;
};

/** Edit a supporter's details. Every field can be cleared; the email is the record's key and changes elsewhere. */
export function PersonForm({ person, action }: { person: PersonFormValues; action: Action }) {
  const [state, formAction] = useActionState(action, null);
  const err = (name: string) => fieldError(state, name);
  return (
    <form action={formAction} className="stack" style={{ gap: 14 }}>
      <Notice state={state} />
      <input type="hidden" name="id" value={person.id} />
      <div className="form-row">
        <TextField id="firstName" name="firstName" label="First name" defaultValue={person.firstName ?? ""} maxLength={80} error={err("firstName")} autoComplete="off" />
        <TextField id="lastName" name="lastName" label="Last name" defaultValue={person.lastName ?? ""} maxLength={80} error={err("lastName")} autoComplete="off" />
      </div>
      <TextField id="phone" name="phone" label="Phone" type="tel" defaultValue={person.phone ?? ""} maxLength={30} error={err("phone")} autoComplete="off" />
      <TextField id="address" name="address" label="Street address" defaultValue={person.address ?? ""} maxLength={200} error={err("address")} autoComplete="off" />
      <div className="form-row">
        <TextField id="city" name="city" label="City" defaultValue={person.city ?? ""} maxLength={80} error={err("city")} autoComplete="off" />
        <TextField id="province" name="province" label="Province" defaultValue={person.province ?? ""} maxLength={40} error={err("province")} autoComplete="off" />
        <TextField id="postalCode" name="postalCode" label="Postal code" defaultValue={person.postalCode ?? ""} maxLength={10} error={err("postalCode")} autoComplete="off" />
      </div>
      <div className="form-row">
        <SelectField id="neighbourhood" name="neighbourhood" label="Neighbourhood" defaultValue={person.neighbourhood ?? ""} error={err("neighbourhood")}>
          <option value="">Not set</option>
          {[...NEIGHBOURHOODS, OUTSIDE_SURREY].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
        <SelectField id="locale" name="locale" label="Preferred language" defaultValue={person.locale ?? ""} error={err("locale")}>
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="form-row">
        <TextField id="birthdate" name="birthdate" label="Date of birth" type="date" defaultValue={person.birthdate ?? ""} error={err("birthdate")} />
        <SelectField id="citizenshipStatus" name="citizenshipStatus" label="Citizenship" defaultValue={person.citizenshipStatus ?? ""} error={err("citizenshipStatus")}>
          <option value="">Not set</option>
          <option value="Citizen">Citizen</option>
          <option value="Permanent resident">Permanent resident</option>
          <option value="Other">Other</option>
        </SelectField>
        <TextField id="gender" name="gender" label="Gender" defaultValue={person.gender ?? ""} maxLength={40} error={err("gender")} autoComplete="off" />
      </div>
      <TextField id="languages" name="languages" label="Languages spoken (comma-separated)" defaultValue={(person.languages ?? []).join(", ")} maxLength={300} error={err("languages")} autoComplete="off" />
      <div className="form-row">
        <SelectField id="campus" name="campus" label="Campus" defaultValue={person.campus ?? ""} error={err("campus")}>
          <option value="">Not a student / not set</option>
          {CAMPUSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField id="source" name="source" label="Source" defaultValue={person.source ?? ""} maxLength={80} error={err("source")} autoComplete="off" />
      </div>
      <TextField id="issue" name="issue" label="Issue they care most about" defaultValue={person.issue ?? ""} maxLength={200} error={err("issue")} autoComplete="off" />
      <fieldset className="group">
        <legend>Interests</legend>
        <Checkbox name="interestVolunteer" defaultChecked={person.interestVolunteer}>
          Wants to volunteer
        </Checkbox>
        <Checkbox name="interestLawnSign" defaultChecked={person.interestLawnSign}>
          Wants a lawn sign
        </Checkbox>
        <Checkbox name="student" defaultChecked={person.student}>
          Student
        </Checkbox>
      </fieldset>
      <div>
        <SubmitButton pendingText="Saving…">Save details</SubmitButton>
      </div>
    </form>
  );
}
