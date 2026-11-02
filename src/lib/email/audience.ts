// Who a campaign or text goes to. Shared by the composer (client), the
// server actions and the audience query, so the definition lives here
// without server-only imports.
import { NEIGHBOURHOODS } from "@/lib/neighbourhoods";

export const AUDIENCE_LISTS = [
  { id: "newsletter", label: "Newsletter subscribers", help: "Confirmed subscribers only." },
  { id: "members", label: "Active members", help: "Membership paid and not yet expired." },
  { id: "lapsed", label: "Lapsed members", help: "Had a membership that has expired, with no active one." },
  { id: "donors", label: "Donors this year", help: "Gave at least once since January 1." },
  { id: "monthly", label: "Monthly donors", help: "An active monthly gift." },
  { id: "volunteers", label: "Volunteers", help: "Ticked \"Volunteering\" on a form." },
  { id: "signers", label: "Signers of a campaign", help: "Signed the petition or pledge chosen below." },
] as const;

export type AudienceList = (typeof AUDIENCE_LISTS)[number]["id"];
const LIST_IDS = AUDIENCE_LISTS.map((l) => l.id) as string[];

/** Language choices: a locale code (from texts) matched alongside the names people tick on the membership form. */
export const LANGUAGE_OPTIONS: { code: string; label: string; names: string[]; locales: string[] }[] = [
  { code: "en", label: "English", names: ["English"], locales: ["en"] },
  { code: "pa", label: "Punjabi", names: ["Punjabi"], locales: ["pa"] },
  { code: "hi", label: "Hindi", names: ["Hindi"], locales: ["hi"] },
  { code: "ur", label: "Urdu", names: ["Urdu"], locales: ["ur"] },
  { code: "zh-Hans", label: "Chinese (Mandarin / Simplified)", names: ["Mandarin", "Chinese"], locales: ["zh-Hans", "zh"] },
  { code: "zh-Hant", label: "Chinese (Cantonese / Traditional)", names: ["Cantonese", "Chinese"], locales: ["zh-Hant", "yue"] },
  { code: "tl", label: "Filipino / Tagalog", names: ["Filipino", "Tagalog"], locales: ["tl", "fil"] },
  { code: "ko", label: "Korean", names: ["Korean"], locales: ["ko"] },
  { code: "vi", label: "Vietnamese", names: ["Vietnamese"], locales: ["vi"] },
  { code: "ar", label: "Arabic", names: ["Arabic"], locales: ["ar"] },
  { code: "fa", label: "Farsi", names: ["Farsi", "Persian"], locales: ["fa"] },
  { code: "gu", label: "Gujarati", names: ["Gujarati"], locales: ["gu"] },
  { code: "es", label: "Spanish", names: ["Spanish"], locales: ["es"] },
  { code: "fr", label: "French", names: ["French"], locales: ["fr"] },
];

export type Audience = {
  /** Every chosen list must match (AND). */
  lists: AudienceList[];
  /** Campaign slug, for the "signers" list. */
  campaign?: string;
  neighbourhood?: string;
  tag?: string;
  language?: string;
};

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Normalize an audience from the database or a form. Unknown lists and empty filters are dropped. */
export function parseAudience(value: unknown): Audience {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawLists = Array.isArray(v.lists) ? v.lists : typeof v.lists === "string" ? [v.lists] : [];
  const lists = [...new Set(rawLists.filter((l): l is AudienceList => typeof l === "string" && LIST_IDS.includes(l)))];
  const audience: Audience = { lists };
  const campaign = str(v.campaign, 80);
  if (campaign && lists.includes("signers")) audience.campaign = campaign;
  const neighbourhood = str(v.neighbourhood, 40);
  if (neighbourhood && (NEIGHBOURHOODS as readonly string[]).includes(neighbourhood)) audience.neighbourhood = neighbourhood;
  const tag = str(v.tag, 60);
  if (tag) audience.tag = tag;
  const language = str(v.language, 20);
  if (language && LANGUAGE_OPTIONS.some((l) => l.code === language)) audience.language = language;
  return audience;
}

/** True when the audience selects anyone at all (no criteria would mean "everyone", which is never allowed). */
export function audienceIsEmpty(a: Audience): boolean {
  return a.lists.length === 0 && !a.neighbourhood && !a.tag && !a.language;
}

export function describeAudience(a: Audience): string {
  const parts = a.lists.map((id) => {
    const label = AUDIENCE_LISTS.find((l) => l.id === id)?.label ?? id;
    return id === "signers" && a.campaign ? `${label}: ${a.campaign}` : label;
  });
  if (a.neighbourhood) parts.push(`in ${a.neighbourhood}`);
  if (a.tag) parts.push(`tagged "${a.tag}"`);
  if (a.language) parts.push(LANGUAGE_OPTIONS.find((l) => l.code === a.language)?.label ?? a.language);
  return parts.length ? parts.join(" + ") : "No audience chosen";
}
