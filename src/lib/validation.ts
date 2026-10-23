import { z } from "zod";
import { CAMPUSES, NEIGHBOURHOODS, OUTSIDE_SURREY, POSTAL_CODE_RE, BC_POSTAL_CODE_RE } from "./neighbourhoods";

const trimmed = (max: number) => z.string().trim().max(max);
const name = trimmed(80).min(1, "Required");
const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const optional = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const postalCode = z.string().trim().regex(POSTAL_CODE_RE, "Enter a postal code like A1A 1A1");
const consent = z.literal(true, { error: "Please tick the box to continue" });
const checkbox = z.boolean().optional().default(false);

// Every public form carries a hidden "website" field. People never fill it in; bots do.
const honeypot = { website: z.string().max(0).optional() };

export const membershipSchema = z
  .object({
    firstName: name,
    lastName: name,
    email,
    phone: optional(30),
    address: trimmed(200).min(1, "Required"),
    city: trimmed(80).min(1, "Required"),
    postalCode,
    neighbourhood: z.enum([...NEIGHBOURHOODS, OUTSIDE_SURREY], { error: "Choose your neighbourhood" }),
    birthdate: z.iso.date("Enter your date of birth"),
    citizenshipStatus: z.enum(["Citizen", "Permanent resident", "Other"], { error: "Choose one" }),
    gender: z.enum(["Male", "Female", "Other", ""]).optional(),
    languages: z.array(trimmed(40)).max(20).optional().default([]),
    student: checkbox,
    campus: z.enum([...CAMPUSES, ""]).optional(),
    issue: optional(200),
    interestVolunteer: checkbox,
    interestLawnSign: checkbox,
    consent,
    ...honeypot,
  })
  .strict();
export type MembershipInput = z.input<typeof membershipSchema>;

export const newsletterSchema = z.object({ email, source: optional(40), ...honeypot }).strict();

export const CAMPAIGNS = {
  "stop-mccallum-pledge": { title: "Stop Doug McCallum and Mandeep Nagra pledge" },
  "skytrain-south-surrey": { title: "SkyTrain to South Surrey petition" },
} as const;
export type CampaignSlug = keyof typeof CAMPAIGNS;

export const signatureSchema = z
  .object({
    campaign: z.enum(Object.keys(CAMPAIGNS) as [CampaignSlug, ...CampaignSlug[]]),
    firstName: name,
    lastName: name,
    email,
    postalCode,
    address: optional(200),
    phone: optional(30),
    answer: optional(200),
    consent,
    ...honeypot,
  })
  .strict();

export const donationSchema = z
  .object({
    frequency: z.enum(["one_time", "monthly"]),
    tier: z.enum(["standard", "star", "superstar"]),
    // Ignored for the Star and Superstar clubs, which are fixed amounts.
    amountCents: z.number().int().min(0).max(100_000_000),
    firstName: name,
    lastName: name,
    email,
    phone: optional(30),
    address: trimmed(200).min(1, "Required"),
    city: trimmed(80).min(1, "Required"),
    postalCode: z.string().trim().regex(BC_POSTAL_CODE_RE, "Contributors must live in BC: enter a BC postal code"),
    attestCitizenOrPR: z.literal(true, { error: "Required to contribute under BC law" }),
    attestBcResident: z.literal(true, { error: "Required to contribute under BC law" }),
    attestOwnFunds: z.literal(true, { error: "Required to contribute under BC law" }),
    newsletter: checkbox,
    ...honeypot,
  })
  .strict();
export type DonationInput = z.input<typeof donationSchema>;

export const rsvpSchema = z
  .object({
    name: trimmed(120).min(1, "Required"),
    email,
    guests: z.number().int().min(0).max(10).optional().default(0),
    newsletter: checkbox,
    ...honeypot,
  })
  .strict();

export const cartSchema = z
  .object({
    items: z
      .array(z.object({ slug: trimmed(80).min(1), quantity: z.number().int().min(1).max(50) }).strict())
      .min(1, "Your cart is empty")
      .max(20),
  })
  .strict();

/** Flatten zod issues to { field: message } for the forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}
