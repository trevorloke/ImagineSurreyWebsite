export const NEIGHBOURHOODS = ["Newton", "Whalley", "Fleetwood", "Cloverdale", "Guildford", "South Surrey"] as const;
export const OUTSIDE_SURREY = "Outside Surrey";

export const CAMPUSES = ["Kwantlen Cloverdale", "Kwantlen Newton", "SFU Surrey", "Another campus"] as const;

// Forward sortation areas (first three characters of a postal code) to town centres.
const FSA_TO_NEIGHBOURHOOD: Record<string, (typeof NEIGHBOURHOODS)[number]> = {
  V3T: "Whalley",
  V3V: "Whalley",
  V3R: "Guildford",
  V4N: "Fleetwood",
  V3W: "Newton",
  V3X: "Newton",
  V3S: "Cloverdale",
  V3Z: "South Surrey",
  V4A: "South Surrey",
  V4P: "South Surrey",
};

export function neighbourhoodForPostalCode(postal: string): string | undefined {
  return FSA_TO_NEIGHBOURHOOD[postal.toUpperCase().replace(/\s+/g, "").slice(0, 3)];
}

/** "v3t1a1" → "V3T 1A1" */
export function normalizePostalCode(postal: string): string {
  const raw = postal.toUpperCase().replace(/\s+/g, "");
  return raw.length === 6 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
}

export const POSTAL_CODE_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
// BC postal codes all start with V.
export const BC_POSTAL_CODE_RE = /^V\d[A-Z] ?\d[A-Z]\d$/i;

export function ageOn(birthdate: string, today: Date): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age;
}

export const MIN_MEMBER_AGE = 14;
