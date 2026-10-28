import "server-only";

function cents(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number of cents, got "${raw}".`);
  return n;
}

// Read lazily so `next build` works without settings present.
export const env = {
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  /** Starbase, the site's backend: where its forms post and its content comes from. */
  get starbaseUrl() {
    return (process.env.STARBASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
  },
  /** The campaign's slug in Starbase (Settings → the workspace). */
  get starbaseWorkspace() {
    return process.env.STARBASE_WORKSPACE ?? "imagine-surrey";
  },
  /** The annual limit the pages quote; Starbase checks the real one on every contribution. */
  get contributionLimitCents() {
    return cents("CONTRIBUTION_LIMIT_CENTS", 142970);
  },
};
