import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

function cents(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number of cents, got "${raw}".`);
  return n;
}

const isProduction = () => process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV && !process.env.E2E_PORT);

// Read lazily so `next build` works without secrets present. Integrations
// (email, SMS, storage) are optional: when their keys are missing the site
// still works and the admin Integrations page says what is unconfigured.
export const env = {
  get siteUrl() {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (configured) return configured;
    // A production deploy must say where it lives: Stripe redirects and email
    // links are built from this.
    if (isProduction()) {
      const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
      if (vercel) return `https://${vercel}`;
      throw new Error("Set NEXT_PUBLIC_SITE_URL to the site's public address (e.g. https://imaginesurrey.ca).");
    }
    const preview = process.env.VERCEL_URL;
    return preview ? `https://${preview}` : "http://localhost:3000";
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  /** "test" or "live", from the key prefix, so ids from one mode are never reused in the other. */
  get stripeMode(): "test" | "live" {
    return this.stripeSecretKey.startsWith("sk_live_") || this.stripeSecretKey.startsWith("rk_live_") ? "live" : "test";
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
  get adminSessionSecret() {
    return required("ADMIN_SESSION_SECRET");
  },
  /** Bootstrap owner account, used only until the first admin user exists. */
  get adminEmail() {
    return optional("ADMIN_EMAIL");
  },
  get adminPassword() {
    return optional("ADMIN_PASSWORD");
  },

  // ── Email (Resend) ──
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM") ?? "Imagine Surrey <hello@imaginesurrey.ca>";
  },
  get emailReplyTo() {
    return optional("EMAIL_REPLY_TO");
  },
  get emailEnabled() {
    return Boolean(this.resendApiKey);
  },

  // ── SMS (Twilio) ──
  get twilioAccountSid() {
    return optional("TWILIO_ACCOUNT_SID");
  },
  get twilioAuthToken() {
    return optional("TWILIO_AUTH_TOKEN");
  },
  /** A phone number in E.164 form, or a Messaging Service SID (MG…). */
  get twilioFrom() {
    return optional("TWILIO_FROM");
  },
  get smsEnabled() {
    return Boolean(this.twilioAccountSid && this.twilioAuthToken && this.twilioFrom);
  },

  // ── Media storage (Supabase Storage); falls back to public/uploads locally ──
  get supabaseUrl() {
    return optional("SUPABASE_URL")?.replace(/\/$/, "");
  },
  get supabaseServiceRoleKey() {
    return optional("SUPABASE_SERVICE_ROLE_KEY");
  },
  get mediaBucket() {
    return optional("SUPABASE_MEDIA_BUCKET") ?? "site-media";
  },
  get storageEnabled() {
    return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
  },

  // ── Scheduled jobs (Vercel Cron calls /api/cron/* with this bearer token) ──
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  // ── Human check on public forms (Cloudflare Turnstile) ──
  // The site key is public (it goes to the browser); the secret stays here.
  get turnstileSiteKey() {
    return optional("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  },
  get turnstileSecretKey() {
    return optional("TURNSTILE_SECRET_KEY");
  },
  /** Cloudflare's siteverify endpoint; overridable so tests can use a fake. */
  get turnstileVerifyUrl() {
    return optional("TURNSTILE_VERIFY_URL") ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  },
  get humanCheckEnabled() {
    return Boolean(this.turnstileSiteKey && this.turnstileSecretKey);
  },

  // ── Analytics: a Plausible domain or GA4 measurement id, injected in the layout ──
  get plausibleDomain() {
    return optional("NEXT_PUBLIC_PLAUSIBLE_DOMAIN");
  },
  get gaMeasurementId() {
    return optional("NEXT_PUBLIC_GA_MEASUREMENT_ID");
  },
};
