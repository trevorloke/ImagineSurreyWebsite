"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { CONSENT_WORDING } from "@/lib/consent-wording";
import { LOCALE_IDS } from "@/lib/engagement";
import { neighbourhoodForPostalCode, normalizePostalCode, OUTSIDE_SURREY, POSTAL_CODE_RE } from "@/lib/neighbourhoods";
import { ActionError, checkbox, optionalText, type ActionState } from "@/lib/server/actions";
import { recordConsent } from "@/lib/server/consent";
import { updatePerson } from "@/lib/server/people";
import { memberAction } from "@/lib/server/portal";

const schema = z.object({
  firstName: optionalText(80),
  lastName: optionalText(80),
  phone: optionalText(30),
  postalCode: optionalText(10).refine((v) => !v || POSTAL_CODE_RE.test(v), "Enter a postal code like A1A 1A1"),
  locale: z.enum(LOCALE_IDS),
  updates: checkbox(),
  sms: checkbox(),
});

/**
 * Save the supporter's own details. A changed tick box is a consent event:
 * the ledger gets the exact wording shown, and the person's current-state
 * columns follow from it (recordConsent does both).
 */
const save = memberAction("/me/preferences", schema, async (data, { person, meta }) => {
  const db = getDb();
  const phone = data.phone ?? null;
  if (data.sms && !phone) throw new ActionError("Add a phone number so we can text you.", { phone: "Needed for texts" });

  const postalCode = data.postalCode ? normalizePostalCode(data.postalCode) : null;
  const neighbourhood = postalCode ? (neighbourhoodForPostalCode(postalCode) ?? OUTSIDE_SURREY) : undefined;

  const common = { personId: person.id, email: person.email, source: "preferences", ip: meta.ip, userAgent: meta.userAgent } as const;
  if (data.updates !== Boolean(person.contactConsentAt)) {
    await recordConsent(db, { ...common, channel: "email", purpose: "updates", action: data.updates ? "grant" : "withdraw", wording: CONSENT_WORDING.updates });
  }
  if (data.sms !== Boolean(person.smsConsentAt)) {
    await recordConsent(db, { ...common, channel: "sms", purpose: "sms", action: data.sms ? "grant" : "withdraw", wording: CONSENT_WORDING.sms });
  }
  await updatePerson(db, person.id, {
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    phone,
    postalCode,
    ...(neighbourhood !== undefined ? { neighbourhood } : {}),
    locale: data.locale,
  });
  return neighbourhood ? `Saved. Your town centre: ${neighbourhood}.` : "Saved.";
});

export async function savePreferences(prev: ActionState, form: FormData): Promise<ActionState> {
  return save(prev, form);
}
