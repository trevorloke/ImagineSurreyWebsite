import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin/content/AdminPage";
import { TestEmailForm, TestSmsForm } from "@/components/admin/content/IntegrationTests";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/server/admin-auth";
import { integrationStats } from "@/lib/server/content-admin";

type Tone = "ok" | "warn" | "off" | "bad";

function when(d: Date | null): string {
  return d ? d.toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" }) : "never";
}

function Card({ title, tone, rows, env: vars, children }: { title: string; tone: Tone; rows: [string, ReactNode][]; env: string[]; children?: ReactNode }) {
  const label = { ok: "working", warn: "needs attention", off: "not configured", bad: "problem" }[tone];
  return (
    <section className="int-card" aria-label={title}>
      <h2>
        <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />
        {title}
        <span className="visually-hidden">: {label}</span>
      </h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {children}
      <p className="int-env">
        Environment: {vars.map((v, i) => (
          <span key={v}>
            {i > 0 && ", "}
            <code>{v}</code>
          </span>
        ))}
      </p>
    </section>
  );
}

export default async function IntegrationsPage() {
  const user = await requireAdmin("integrations");
  const stats = await integrationStats(getDb());

  // Stripe getters throw when the keys are missing; show that instead of crashing.
  let stripeMode: string | null = null;
  try {
    stripeMode = env.stripeMode;
  } catch {
    stripeMode = null;
  }
  let webhookSet = false;
  try {
    webhookSet = Boolean(env.stripeWebhookSecret);
  } catch {
    webhookSet = false;
  }
  // Vercel's filesystem is read-only, so uploads there need Supabase Storage.
  // The flag is read here for the warning only; storage.ts checks it the same way.
  const onVercel = Boolean(process.env.VERCEL);
  const analytics = env.plausibleDomain ? `Plausible (${env.plausibleDomain})` : env.gaMeasurementId ? `Google Analytics (${env.gaMeasurementId})` : null;
  const queueStale = stats.email.oldestQueuedAt ? Date.now() - stats.email.oldestQueuedAt.getTime() > 10 * 60_000 : false;
  const humanKeys = [env.turnstileSiteKey, env.turnstileSecretKey].filter(Boolean).length;

  return (
    <AdminPage title="Integrations" intro="What is connected, what is not, and the environment variables that control each one. Keys are set in the hosting dashboard, never here.">
      <div className="int-cards">
        <Card
          title="Stripe"
          tone={!stripeMode ? "off" : !webhookSet ? "warn" : "ok"}
          rows={[
            ["Mode", stripeMode ? (stripeMode === "live" ? "Live (real payments)" : "Test") : "Not configured"],
            ["Webhook secret", webhookSet ? "Set" : "Missing: payments won't be recorded"],
            ["Last webhook event", when(stats.stripe.lastEventAt)],
            ["Events processed", String(stats.stripe.total)],
          ]}
          env={["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "CONTRIBUTION_LIMIT_CENTS", "MEMBERSHIP_FEE_CENTS"]}
        />
        <Card
          title="Email"
          tone={!env.emailEnabled ? "off" : stats.email.failed7d > 0 && stats.email.sent7d === 0 ? "bad" : stats.email.failed7d > 0 ? "warn" : "ok"}
          rows={[
            ["Provider", env.emailEnabled ? "Resend, configured" : "Not configured: messages are logged as skipped"],
            ["From", env.emailFrom],
            ["Reply-to", env.emailReplyTo ?? "same as From"],
            ["Sent, last 7 days", String(stats.email.sent7d)],
            ["Failed or skipped, last 7 days", String(stats.email.failed7d)],
            ["Waiting in the queue", String(stats.email.queued)],
          ]}
          env={["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO"]}
        >
          <TestEmailForm to={user.email} />
        </Card>
        <Card
          title="Text messages"
          tone={env.smsEnabled ? "ok" : "off"}
          rows={[
            ["Provider", env.smsEnabled ? "Twilio, configured" : "Not configured: texts are logged as skipped"],
            ["From", env.twilioFrom ?? "—"],
          ]}
          env={["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]}
        >
          {env.smsEnabled ? <TestSmsForm /> : <p className="small">Set the three Twilio variables to enable texting and the test button.</p>}
        </Card>
        <Card
          title="Image storage"
          tone={env.storageEnabled ? "ok" : onVercel ? "bad" : "warn"}
          rows={[
            ["Provider", env.storageEnabled ? `Supabase Storage, bucket "${env.mediaBucket}"` : onVercel ? "Not configured: uploads fail on Vercel" : "Not configured: uploads go to public/uploads on this machine"],
          ]}
          env={["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_MEDIA_BUCKET"]}
        >
          {!env.storageEnabled && onVercel && (
            <p className="small" style={{ color: "var(--red-hover)", fontWeight: 700 }}>
              This deployment runs on Vercel without Supabase Storage, so the media library can't accept uploads. Create a public bucket and set the variables.
            </p>
          )}
        </Card>
        <Card
          title="Human check (Cloudflare Turnstile)"
          tone={env.humanCheckEnabled ? "ok" : onVercel ? "bad" : "warn"}
          rows={[
            [
              "Status",
              env.humanCheckEnabled
                ? "On: sign-up, RSVP, follow, sign-in and preference-link forms must pass it"
                : humanKeys === 1
                  ? "Off: only one of the two keys is set"
                  : "Off: public forms rely on the honeypot and rate limits only",
            ],
            ["Checked by", env.turnstileVerifyUrl],
          ]}
          env={["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_VERIFY_URL"]}
        >
          {!env.humanCheckEnabled && (
            <p className="small" style={{ color: "var(--red-hover)", fontWeight: 700 }}>
              The live site should have this on: every accepted sign-up becomes a supporter record here and in Starbase, and can file a request for the desk. Make a free
              Turnstile widget in Cloudflare and set both keys.
            </p>
          )}
        </Card>
        <Card title="Analytics" tone={analytics ? "ok" : "off"} rows={[["Service", analytics ?? "None"]]} env={["NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "NEXT_PUBLIC_GA_MEASUREMENT_ID"]} />
        <Card
          title="Scheduled jobs"
          tone={!env.cronSecret ? (onVercel ? "bad" : "warn") : queueStale ? "warn" : "ok"}
          rows={[
            ["Cron secret", env.cronSecret ? "Set" : onVercel ? "Missing: the cron job can't run" : "Not set (fine locally)"],
            ["Email job last sent", when(stats.email.lastCronAt)],
            ["Oldest queued email", stats.email.oldestQueuedAt ? `${when(stats.email.oldestQueuedAt)}${queueStale ? " (waiting too long: is the cron job running?)" : ""}` : "nothing waiting"],
          ]}
          env={["CRON_SECRET"]}
        />
        <Card
          title="Database"
          tone={stats.database.ok ? "ok" : "bad"}
          rows={[
            ["Connection", stats.database.ok ? "OK" : `Problem: ${stats.database.error ?? "unknown"}`],
            ["Migrations applied", stats.database.migrations === null ? "unknown" : String(stats.database.migrations)],
          ]}
          env={["DATABASE_URL"]}
        />
        <Card title="Site" tone="ok" rows={[["Public address", env.siteUrl]]} env={["NEXT_PUBLIC_SITE_URL", "ADMIN_SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]} />
      </div>
    </AdminPage>
  );
}
