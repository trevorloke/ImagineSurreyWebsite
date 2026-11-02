import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { emailCampaigns, emailLog } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * All outgoing email goes through here. Every message is written to
 * email_log first, then handed to Resend. Without RESEND_API_KEY the message
 * is logged as "skipped" (and printed in development) so the site keeps
 * working and the admin can see what would have gone out.
 */
export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** "welcome", "rsvp", "magic-link", "campaign", … */
  kind: string;
  personId?: string | null;
  campaignId?: string | null;
  replyTo?: string;
  unsubscribeUrl?: string | null;
};

export type SendResult = { id: string; status: "sent" | "failed" | "skipped"; error?: string };

const RESEND = "https://api.resend.com";

function headersFor(email: OutgoingEmail): Record<string, string> {
  const h: Record<string, string> = {};
  if (email.unsubscribeUrl) {
    // One-click unsubscribe (RFC 8058), required by Gmail and Yahoo for bulk senders.
    h["List-Unsubscribe"] = `<${email.unsubscribeUrl}>`;
    h["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return h;
}

/** Send one email now (transactional). */
export async function sendEmail(db: Db, email: OutgoingEmail): Promise<SendResult> {
  const [row] = await db
    .insert(emailLog)
    .values({ to: email.to.toLowerCase(), subject: email.subject, html: email.html, text: email.text ?? null, kind: email.kind, personId: email.personId ?? null, campaignId: email.campaignId ?? null, attempts: 1 })
    .returning({ id: emailLog.id });

  if (!env.emailEnabled) {
    if (process.env.NODE_ENV !== "production") console.log(`[email skipped: no RESEND_API_KEY] to=${email.to} subject=${email.subject}`);
    await db.update(emailLog).set({ status: "skipped", error: "RESEND_API_KEY is not set" }).where(eq(emailLog.id, row.id));
    return { id: row.id, status: "skipped", error: "Email is not configured" };
  }

  try {
    const res = await fetch(`${RESEND}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        reply_to: email.replyTo ?? env.emailReplyTo,
        headers: headersFor(email),
        tags: [{ name: "kind", value: email.kind.replace(/[^a-zA-Z0-9_-]/g, "_") }],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) throw new Error(data.message ?? `Resend responded ${res.status}`);
    await db.update(emailLog).set({ status: "sent", providerId: data.id ?? null, sentAt: new Date() }).where(eq(emailLog.id, row.id));
    return { id: row.id, status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(emailLog).set({ status: "failed", error: message.slice(0, 500) }).where(eq(emailLog.id, row.id));
    return { id: row.id, status: "failed", error: message };
  }
}

/** Queue emails to be sent in batches by the cron job (campaigns, reminders). */
export async function queueEmails(db: Db, emails: OutgoingEmail[]): Promise<number> {
  if (emails.length === 0) return 0;
  const rows = emails.map((e) => ({ to: e.to.toLowerCase(), subject: e.subject, html: e.html, text: e.text ?? null, kind: e.kind, personId: e.personId ?? null, campaignId: e.campaignId ?? null }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(emailLog).values(rows.slice(i, i + 500));
  return rows.length;
}

const MAX_ATTEMPTS = 3;
const BATCH = 100;

/**
 * Send queued emails, oldest first, up to `limit`, in Resend batches of 100.
 * Safe to run from several instances at once: rows are claimed with
 * SKIP LOCKED. Returns how many were sent and how many failed.
 */
export async function sendQueued(db: Db, limit = 300): Promise<{ sent: number; failed: number; skipped: number }> {
  const totals = { sent: 0, failed: 0, skipped: 0 };
  const touchedCampaigns = new Set<string>();

  while (totals.sent + totals.failed + totals.skipped < limit) {
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        select id from email_log
        where status = 'queued' and attempts < ${MAX_ATTEMPTS}
        order by created_at
        limit ${Math.min(BATCH, limit - (totals.sent + totals.failed + totals.skipped))}
        for update skip locked`);
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
      await tx.update(emailLog).set({ attempts: sql`${emailLog.attempts} + 1` }).where(inArray(emailLog.id, ids));
      return tx.select().from(emailLog).where(inArray(emailLog.id, ids));
    });
    if (claimed.length === 0) break;
    for (const r of claimed) if (r.campaignId) touchedCampaigns.add(r.campaignId);

    if (!env.emailEnabled) {
      await db.update(emailLog).set({ status: "skipped", error: "RESEND_API_KEY is not set" }).where(inArray(emailLog.id, claimed.map((r) => r.id)));
      totals.skipped += claimed.length;
      continue;
    }

    try {
      const res = await fetch(`${RESEND}/emails/batch`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify(
          claimed.map((r) => ({
            from: env.emailFrom,
            to: [r.to],
            subject: r.subject,
            html: r.html ?? "",
            text: r.text ?? undefined,
            reply_to: env.emailReplyTo,
            headers: headersFor({ to: r.to, subject: r.subject, html: "", kind: r.kind, unsubscribeUrl: unsubscribeLinkFrom(r.html) }),
          })),
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { data?: { id: string }[]; message?: string };
      if (!res.ok) throw new Error(data.message ?? `Resend responded ${res.status}`);
      const ids = data.data ?? [];
      for (let i = 0; i < claimed.length; i++) {
        await db.update(emailLog).set({ status: "sent", providerId: ids[i]?.id ?? null, sentAt: new Date() }).where(eq(emailLog.id, claimed[i].id));
      }
      totals.sent += claimed.length;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      // Rows under the attempt limit go back to the queue for the next run.
      await db.update(emailLog).set({ error: message }).where(inArray(emailLog.id, claimed.map((r) => r.id)));
      await db
        .update(emailLog)
        .set({ status: "failed" })
        .where(and(inArray(emailLog.id, claimed.map((r) => r.id)), sql`${emailLog.attempts} >= ${MAX_ATTEMPTS}`));
      totals.failed += claimed.length;
      break;
    }
  }

  for (const id of touchedCampaigns) await refreshCampaignCounts(db, id);
  return totals;
}

/** The unsubscribe link a campaign email carries, so the List-Unsubscribe header can match it. */
function unsubscribeLinkFrom(html: string | null): string | null {
  const m = html?.match(/href="([^"]*\/newsletter\/unsubscribe\?token=[^"]+)"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

export async function refreshCampaignCounts(db: Db, campaignId: string): Promise<void> {
  const [c] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${emailLog.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${emailLog.status} in ('failed', 'skipped'))::int`,
      queued: sql<number>`count(*) filter (where ${emailLog.status} = 'queued')::int`,
    })
    .from(emailLog)
    .where(eq(emailLog.campaignId, campaignId));
  await db
    .update(emailCampaigns)
    .set({ sentCount: c.sent, failedCount: c.failed, ...(c.queued === 0 ? { status: "sent", sentAt: sql`coalesce(${emailCampaigns.sentAt}, now())` } : {}) })
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.status, "sending")));
}

/** Drop stored bodies of old sent mail so the log stays small; the metadata stays. */
export async function pruneEmailBodies(db: Db, olderThanDays = 90): Promise<void> {
  await db
    .update(emailLog)
    .set({ html: null, text: null })
    .where(and(lt(emailLog.createdAt, new Date(Date.now() - olderThanDays * 86_400_000)), sql`${emailLog.html} is not null`));
}
