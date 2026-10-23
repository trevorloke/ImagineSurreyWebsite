import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}

function cents(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number of cents, got "${raw}".`);
  return n;
}

// Read lazily so `next build` works without secrets present.
export const env = {
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get contributionLimitCents() {
    return cents("CONTRIBUTION_LIMIT_CENTS", 142970);
  },
  get membershipFeeCents() {
    return cents("MEMBERSHIP_FEE_CENTS", 1000);
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  get adminSessionSecret() {
    return required("ADMIN_SESSION_SECRET");
  },
};
