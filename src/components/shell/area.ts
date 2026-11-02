// "Your Surrey": the visitor's town centre, remembered in a cookie so the home
// page can show what is happening near them. Pure helpers, used on both the
// server (reading the cookie) and the client (setting it).
import { NEIGHBOURHOODS, neighbourhoodForPostalCode, POSTAL_CODE_RE } from "@/lib/neighbourhoods";

export type Area = (typeof NEIGHBOURHOODS)[number];

export const AREA_COOKIE = "is_area";
export const AREA_STORAGE_KEY = "is_area";
export const AREA_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Local counts are published only once they reach this, so no one is identifiable. */
export const LOCAL_COUNT_THRESHOLD = 10;

/** A cookie value → one of the six town centres, or null for anything else. */
export function parseArea(raw: string | null | undefined): Area | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Not URI-encoded; use as is.
  }
  const wanted = value.trim().toLowerCase();
  return NEIGHBOURHOODS.find((n) => n.toLowerCase() === wanted) ?? null;
}

/** "South Surrey" → "south-surrey", the path of its neighbourhood page. */
export function areaSlug(area: string): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type AreaLookup = { ok: true; area: Area } | { ok: false; message: string };

/** What a postal code typed into the "Your area" box resolves to. */
export function areaForPostalCode(input: string): AreaLookup {
  const postal = input.trim();
  if (!postal) return { ok: false, message: "Enter your postal code, for example V3W 1A1." };
  if (!POSTAL_CODE_RE.test(postal)) return { ok: false, message: "That doesn't look like a postal code. Try one like V3W 1A1." };
  const area = parseArea(neighbourhoodForPostalCode(postal));
  if (!area) return { ok: false, message: "That postal code is outside Surrey's six town centres. You can still take part from anywhere." };
  return { ok: true, area };
}

/** The Set-Cookie style string the browser stores. */
export function areaCookieString(area: Area): string {
  return `${AREA_COOKIE}=${encodeURIComponent(area)}; Max-Age=${AREA_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

/** "12 people in Newton have signed the pledge" or an invitation to be one of the first. */
export function localCountText(count: number, area: string, action: string): string {
  if (count < LOCAL_COUNT_THRESHOLD) return `Be one of the first in ${area} to ${action}.`;
  return `${count.toLocaleString("en-CA")} people in ${area} have ${pastTense(action)}.`;
}

function pastTense(action: string): string {
  // "sign the pledge" → "signed the pledge"
  return action.replace(/^sign\b/, "signed");
}
