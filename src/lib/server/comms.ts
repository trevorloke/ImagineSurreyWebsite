import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { emailCampaigns, emailLog, eventRsvps, events, newsletterSubscribers, people, shiftOpenings, shifts, smsLog, volunteerTasks } from "@/lib/db/schema";
import { audienceIsEmpty, LANGUAGE_OPTIONS, parseAudience, type Audience } from "@/lib/email/audience";
import { classifyInbound, type InboundIntent } from "@/lib/email/inbound-sms";
import { renderCampaignEmail, sampleMergeValues, FIRST_NAME_FALLBACK, type MergeValues } from "@/lib/email/merge";
import { eventReminderEmail, eventReminderText, shiftReminderEmail, shiftReminderText, STOP_LINE, type ShiftForEmail } from "@/lib/email/notifications";
import type { MessageContext } from "@/lib/email/messages";
import { pacificDate } from "@/lib/ics";
import { withRef } from "@/lib/share";
import { addDays, todayInSurrey } from "@/lib/shifts";
import { recordConsent } from "./consent";
import { emailContext, queueEmails, sendEmail, sendQueued, type OutgoingEmail, type SendResult } from "./email";
import { ensureSubscriberToken, unsubscribeUrlFor } from "./newsletter";
import { ensureReferralCode } from "./people";
import { normalizePhone, sendSms } from "./sms";

/** A problem to show the admin as-is (nothing was changed). */
export class CommsError extends Error {}

// ── Audiences ─────────────────────────────────────────────────────────────

const YEAR_START = sql`date_trunc('year', now() at time zone 'America/Vancouver') at time zone 'America/Vancouver'`;

/** WHERE conditions on the people table for an audience. Email audiences also need consent and no unsubscribe. */
function audienceConditions(a: Audience, channel: "email" | "sms"): SQL[] {
  const conds: SQL[] = [];
  if (channel === "email") {
    conds.push(sql`not exists (select 1 from newsletter_subscribers ns where ns.email = ${people.email} and ns.status = 'unsubscribed')`);
    if (!a.lists.includes("newsletter")) conds.push(sql`${people.contactConsentAt} is not null`);
  } else {
    conds.push(sql`${people.smsConsentAt} is not null`, sql`${people.phone} is not null`);
  }
  for (const list of a.lists) {
    switch (list) {
      case "newsletter":
        conds.push(sql`exists (select 1 from newsletter_subscribers ns where ns.email = ${people.email} and ns.status = 'subscribed' and ns.confirmed_at is not null)`);
        break;
      case "members":
        conds.push(sql`exists (select 1 from memberships m where m.person_id = ${people.id} and m.status = 'active' and m.expires_at > now())`);
        break;
      case "lapsed":
        conds.push(
          sql`exists (select 1 from memberships m where m.person_id = ${people.id} and (m.status = 'expired' or (m.status = 'active' and m.expires_at <= now())))`,
          sql`not exists (select 1 from memberships m where m.person_id = ${people.id} and m.status = 'active' and m.expires_at > now())`,
        );
        break;
      case "donors":
        // Donations only (membership fees are contributions too, but not gifts), net of any refund over the limit.
        conds.push(
          sql`exists (select 1 from contributions c where c.person_id = ${people.id} and c.kind = 'donation' and c.status in ('succeeded', 'refunded_over_limit') and c.amount_cents > c.refunded_cents and c.paid_at >= ${YEAR_START})`,
        );
        break;
      case "monthly":
        conds.push(sql`exists (select 1 from recurring_donations r where r.person_id = ${people.id} and r.status = 'active')`);
        break;
      case "volunteers":
        conds.push(sql`${people.interestVolunteer} = true`);
        break;
      case "signers":
        // Without a campaign chosen, nobody matches rather than everybody.
        conds.push(a.campaign ? sql`exists (select 1 from campaign_signatures s where s.person_id = ${people.id} and s.campaign = ${a.campaign})` : sql`false`);
        break;
    }
  }
  if (a.neighbourhood) conds.push(eq(people.neighbourhood, a.neighbourhood));
  if (a.tag) conds.push(sql`${a.tag} = any(${people.tags})`);
  if (a.language) {
    const option = LANGUAGE_OPTIONS.find((l) => l.code === a.language);
    if (option) {
      const names = sql.join(option.names.map((n) => sql`${n}`), sql`, `);
      conds.push(or(inArray(people.locale, option.locales), sql`exists (select 1 from unnest(coalesce(${people.languages}, '{}'::text[])) as l(name) where l.name in (${names}))`)!);
    }
  }
  return conds;
}

export type EmailRecipient = { id: string; email: string; firstName: string | null; referralCode: string | null };

export async function loadEmailRecipients(db: Db, a: Audience): Promise<EmailRecipient[]> {
  if (audienceIsEmpty(a)) return [];
  return db
    .select({ id: people.id, email: people.email, firstName: people.firstName, referralCode: people.referralCode })
    .from(people)
    .where(and(...audienceConditions(a, "email")))
    .orderBy(asc(people.email));
}

export async function countEmailAudience(db: Db, a: Audience): Promise<number> {
  if (audienceIsEmpty(a)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(people)
    .where(and(...audienceConditions(a, "email")));
  return row.n;
}

export type SmsRecipient = { id: string; phone: string; firstName: string | null };

/** People who said yes to texts and have a number we can dial, one per number. */
export async function loadSmsRecipients(db: Db, a: Audience): Promise<SmsRecipient[]> {
  if (audienceIsEmpty(a)) return [];
  const rows = await db
    .select({ id: people.id, phone: people.phone, firstName: people.firstName })
    .from(people)
    .where(and(...audienceConditions(a, "sms")))
    .orderBy(asc(people.createdAt));
  const seen = new Set<string>();
  const out: SmsRecipient[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({ id: r.id, phone, firstName: r.firstName });
  }
  return out;
}

export async function countSmsAudience(db: Db, a: Audience): Promise<number> {
  return (await loadSmsRecipients(db, a)).length;
}

// ── Campaigns ─────────────────────────────────────────────────────────────

// Same alphabet as ensureReferralCode: no 0/O/1/I.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

/** Give every listed person a referral code, in one statement where possible. */
async function bulkEnsureReferralCodes(db: Db, recipients: EmailRecipient[]): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  const missing: EmailRecipient[] = [];
  for (const r of recipients) {
    if (r.referralCode) codes.set(r.id, r.referralCode);
    else missing.push(r);
  }
  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500);
    try {
      const values = sql.join(chunk.map((r) => sql`(${r.id}::uuid, ${newCode()})`), sql`, `);
      const rows = await db.execute<{ id: string; referral_code: string }>(
        sql`update people set referral_code = v.code from (values ${values}) as v(id, code) where people.id = v.id and people.referral_code is null returning people.id, people.referral_code`,
      );
      for (const row of rows) codes.set(row.id, row.referral_code);
    } catch {
      // A code collided (vanishingly rare): fall back to one at a time.
    }
    for (const r of chunk) if (!codes.has(r.id)) codes.set(r.id, await ensureReferralCode(db, r.id));
  }
  return codes;
}

/** An unsubscribe token for every recipient, creating "pending" subscriber rows for addresses without one. */
async function bulkEnsureSubscriberTokens(db: Db, recipients: EmailRecipient[]): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  const emails = recipients.map((r) => r.email);
  for (let i = 0; i < emails.length; i += 1000) {
    const rows = await db
      .select({ email: newsletterSubscribers.email, token: newsletterSubscribers.unsubscribeToken })
      .from(newsletterSubscribers)
      .where(inArray(newsletterSubscribers.email, emails.slice(i, i + 1000)));
    for (const row of rows) tokens.set(row.email, row.token);
  }
  const missing = recipients.filter((r) => !tokens.has(r.email));
  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500);
    const inserted = await db
      .insert(newsletterSubscribers)
      .values(chunk.map((r) => ({ email: r.email, personId: r.id, status: "pending" as const, source: "campaign", unsubscribeToken: randomBytes(24).toString("base64url") })))
      .onConflictDoNothing({ target: newsletterSubscribers.email })
      .returning({ email: newsletterSubscribers.email, token: newsletterSubscribers.unsubscribeToken });
    for (const row of inserted) tokens.set(row.email, row.token);
    for (const r of chunk) if (!tokens.has(r.email)) tokens.set(r.email, await ensureSubscriberToken(db, r.email, r.id));
  }
  return tokens;
}

export function mergeValuesFor(ctx: MessageContext, r: { firstName: string | null; token: string; referralCode: string }): MergeValues {
  return {
    first_name: r.firstName?.trim() || FIRST_NAME_FALLBACK,
    unsubscribe_url: unsubscribeUrlFor(r.token),
    referral_link: withRef(`${ctx.siteUrl}/#join`, r.referralCode),
    site_url: ctx.siteUrl,
  };
}

/**
 * Send a draft campaign: mark it sending and queue one personalised email
 * per recipient. The caller sends the first batch (sendQueued) after the
 * response; the email cron sends the rest. Returns the recipient count.
 */
export async function queueCampaign(db: Db, campaignId: string): Promise<number> {
  const campaign = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!campaign) throw new CommsError("That campaign no longer exists.");
  if (campaign.status !== "draft") throw new CommsError("This campaign has already been sent.");
  const audience = parseAudience(campaign.audience);
  if (audienceIsEmpty(audience)) throw new CommsError("Choose an audience before sending.");
  const recipients = await loadEmailRecipients(db, audience);
  if (recipients.length === 0) throw new CommsError("Nobody matches this audience, so there is no one to send to.");

  const claimed = await db
    .update(emailCampaigns)
    .set({ status: "sending", recipientCount: recipients.length, sentCount: 0, failedCount: 0, updatedAt: new Date() })
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.status, "draft")))
    .returning({ id: emailCampaigns.id });
  if (claimed.length === 0) throw new CommsError("This campaign is already being sent.");

  try {
    const [codes, tokens, ctx] = await Promise.all([bulkEnsureReferralCodes(db, recipients), bulkEnsureSubscriberTokens(db, recipients), emailContext()]);
    const content = { subject: campaign.subject, preheader: campaign.preheader, body: campaign.body };
    const emails: OutgoingEmail[] = recipients.map((r) => {
      const rendered = renderCampaignEmail(ctx, content, mergeValuesFor(ctx, { firstName: r.firstName, token: tokens.get(r.email)!, referralCode: codes.get(r.id)! }));
      return { to: r.email, subject: rendered.subject, html: rendered.html, text: rendered.text, kind: "campaign", personId: r.id, campaignId };
    });
    await queueEmails(db, emails);
    return emails.length;
  } catch (err) {
    // Nothing queued yet (or only part of it): put the campaign back to draft
    // so it can be sent again, removing any half-written queue.
    await db.delete(emailLog).where(and(eq(emailLog.campaignId, campaignId), eq(emailLog.status, "queued")));
    await db.update(emailCampaigns).set({ status: "draft", recipientCount: 0, updatedAt: new Date() }).where(eq(emailCampaigns.id, campaignId));
    throw err;
  }
}

/** Send the campaign to one address with sample merge values. */
export async function sendCampaignTest(db: Db, campaignId: string, to: string, firstName?: string | null): Promise<SendResult> {
  const campaign = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!campaign) throw new CommsError("That campaign no longer exists.");
  const ctx = await emailContext();
  const rendered = renderCampaignEmail(ctx, { subject: campaign.subject, preheader: campaign.preheader, body: campaign.body }, sampleMergeValues(ctx, firstName));
  return sendEmail(db, { to, subject: `[Test] ${rendered.subject}`, html: rendered.html, text: rendered.text, kind: "campaign-test", unsubscribeUrl: null });
}

/** Stop a campaign: anything still queued is marked skipped and never goes out. */
export async function cancelCampaign(db: Db, campaignId: string): Promise<boolean> {
  const rows = await db
    .update(emailCampaigns)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(emailCampaigns.id, campaignId), inArray(emailCampaigns.status, ["draft", "sending"])))
    .returning({ id: emailCampaigns.id });
  if (rows.length === 0) return false;
  await db
    .update(emailLog)
    .set({ status: "skipped", error: "Campaign cancelled" })
    .where(and(eq(emailLog.campaignId, campaignId), eq(emailLog.status, "queued")));
  return true;
}

export type CampaignProgress = { queued: number; sent: number; failed: number; skipped: number };

export async function campaignProgress(db: Db, campaignId: string): Promise<CampaignProgress> {
  const [row] = await db
    .select({
      queued: sql<number>`count(*) filter (where ${emailLog.status} = 'queued')::int`,
      sent: sql<number>`count(*) filter (where ${emailLog.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${emailLog.status} = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where ${emailLog.status} = 'skipped')::int`,
    })
    .from(emailLog)
    .where(eq(emailLog.campaignId, campaignId));
  return row;
}

export async function campaignProgressAll(db: Db): Promise<Map<string, CampaignProgress>> {
  const rows = await db
    .select({
      campaignId: emailLog.campaignId,
      queued: sql<number>`count(*) filter (where ${emailLog.status} = 'queued')::int`,
      sent: sql<number>`count(*) filter (where ${emailLog.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${emailLog.status} = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where ${emailLog.status} = 'skipped')::int`,
    })
    .from(emailLog)
    .where(sql`${emailLog.campaignId} is not null`)
    .groupBy(emailLog.campaignId);
  return new Map(rows.filter((r) => r.campaignId).map((r) => [r.campaignId!, { queued: r.queued, sent: r.sent, failed: r.failed, skipped: r.skipped }]));
}

// ── Texts ─────────────────────────────────────────────────────────────────

const SMS_BATCH = 20;

/** Text everyone in the list, a batch at a time. Each text is logged by sendSms. */
export async function sendSmsBroadcast(db: Db, recipients: SmsRecipient[], body: string, kind = "broadcast"): Promise<{ sent: number; failed: number; skipped: number }> {
  const totals = { sent: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < recipients.length; i += SMS_BATCH) {
    const results = await Promise.all(recipients.slice(i, i + SMS_BATCH).map((r) => sendSms(db, { to: r.phone, body, kind, personId: r.id })));
    for (const r of results) totals[r.status] += 1;
  }
  return totals;
}

/** People whose phone number, in any format, is this E.164 number. */
async function peopleByPhone(db: Db, phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^1/, "");
  return db
    .select({ id: people.id, email: people.email, smsConsentAt: people.smsConsentAt })
    .from(people)
    .where(sql`regexp_replace(coalesce(${people.phone}, ''), '\\D', '', 'g') in (${digits}, ${"1" + digits})`);
}

/**
 * Handle a text sent to our number. STOP words withdraw consent; START
 * words restore it; language words set the person's locale. Everything is
 * logged, and the reply goes back as TwiML.
 */
export async function handleInboundSms(db: Db, ctx: MessageContext & { orgPhone?: string }, input: { from: string; body: string; messageSid?: string | null }): Promise<{ intent: InboundIntent; reply: string }> {
  const phone = normalizePhone(input.from);
  const intent = classifyInbound(input.body);
  const matches = phone ? await peopleByPhone(db, phone) : [];
  const ids = matches.map((m) => m.id);
  const now = new Date();
  let reply: string;
  switch (intent.kind) {
    case "stop":
      // Each withdrawal goes to the consent ledger, which also clears smsConsentAt.
      for (const m of matches) await recordConsent(db, { personId: m.id, email: m.email, channel: "sms", purpose: "sms", action: "withdraw", wording: `Texted "${input.body.trim().slice(0, 40)}"`, source: "sms-stop" });
      reply = `You're opted out of ${ctx.orgName} texts and won't get any more. Reply START to opt back in.`;
      break;
    case "start":
      // A text from the number is proof of control of it, so START may undo an earlier STOP.
      if (ids.length) {
        for (const m of matches) await recordConsent(db, { personId: m.id, email: m.email, channel: "sms", purpose: "sms", action: "grant", wording: `Texted "${input.body.trim().slice(0, 40)}"`, source: "sms-start", verified: true });
        reply = `You're opted in to ${ctx.orgName} texts about events and actions near you. ${STOP_LINE}`;
      } else {
        reply = `Thanks! We don't have this number on file yet. Join at ${ctx.siteUrl}/#join and tick texts to get updates. ${STOP_LINE}`;
      }
      break;
    case "help":
      reply = `${ctx.orgName}: email ${ctx.orgEmail}${ctx.orgPhone ? ` or call ${ctx.orgPhone}` : ""}. More at ${ctx.siteUrl}. ${STOP_LINE}`;
      break;
    case "join":
      reply = `Become a member of ${ctx.orgName}: ${ctx.siteUrl}/#join ${STOP_LINE}`;
      break;
    case "language":
      if (ids.length) await db.update(people).set({ locale: intent.locale, updatedAt: now }).where(inArray(people.id, ids));
      reply = `Got it. We'll send you ${ctx.orgName} updates in ${intent.language} whenever we can. ${STOP_LINE}`;
      break;
    default:
      reply = `Thanks for your message! Find out more at ${ctx.siteUrl}, or reply HELP. ${STOP_LINE}`;
  }
  await db.insert(smsLog).values({
    to: phone ?? input.from.slice(0, 40),
    personId: ids[0] ?? null,
    kind: `inbound-${intent.kind}`,
    body: `Received: ${input.body.trim().slice(0, 500)}\nReplied: ${reply}`,
    status: "sent",
    providerId: input.messageSid ?? null,
    sentAt: now,
  });
  return { intent, reply };
}

// ── Reminders ─────────────────────────────────────────────────────────────


/**
 * The day-before reminders: RSVPs for events starting 20 to 28 hours from
 * now, and shifts dated tomorrow (Pacific). Rows are claimed by setting
 * reminderSentAt first, so two overlapping runs never send twice. Emails
 * are queued and the first batch sent at once; texts go to people who said
 * yes to them.
 */
export async function sendReminders(db: Db, now = new Date()): Promise<{ events: number; shifts: number; texts: number; emails: number }> {
  const ctx = await emailContext();
  const emails: OutgoingEmail[] = [];
  let texts = 0;

  const due = await db
    .select({ rsvp: eventRsvps, event: events, person: { id: people.id, phone: people.phone, smsConsentAt: people.smsConsentAt } })
    .from(eventRsvps)
    .innerJoin(events, eq(events.id, eventRsvps.eventId))
    .leftJoin(people, eq(people.id, eventRsvps.personId))
    // Events on tomorrow's date in Surrey, so a once-a-day run reminds everyone
    // (and the email can honestly say "tomorrow"); more frequent runs are harmless.
    .where(and(isNull(eventRsvps.reminderSentAt), eq(events.published, true), gte(events.startsAt, pacificDate(addDays(todayInSurrey(now), 1), 0)), lt(events.startsAt, pacificDate(addDays(todayInSurrey(now), 2), 0))));
  const claimedRsvps = due.length
    ? new Set(
        (
          await db
            .update(eventRsvps)
            .set({ reminderSentAt: now })
            .where(and(inArray(eventRsvps.id, due.map((d) => d.rsvp.id)), isNull(eventRsvps.reminderSentAt)))
            .returning({ id: eventRsvps.id })
        ).map((r) => r.id),
      )
    : new Set<string>();
  let eventCount = 0;
  for (const d of due) {
    if (!claimedRsvps.has(d.rsvp.id)) continue;
    eventCount += 1;
    const built = eventReminderEmail(ctx, { name: d.rsvp.name, guests: d.rsvp.guests, event: d.event });
    emails.push({ to: d.rsvp.email, ...built, kind: "event-reminder", personId: d.rsvp.personId });
    const phone = d.person?.smsConsentAt ? normalizePhone(d.person.phone) : null;
    if (phone) {
      await sendSms(db, { to: phone, body: eventReminderText(ctx, d.event), kind: "event-reminder", personId: d.rsvp.personId });
      texts += 1;
    }
  }

  const tomorrow = addDays(todayInSurrey(now), 1);
  const dueShifts = await db
    .select({ shift: shifts, person: { id: people.id, email: people.email, firstName: people.firstName, phone: people.phone, smsConsentAt: people.smsConsentAt }, opening: shiftOpenings, task: { name: volunteerTasks.name } })
    .from(shifts)
    .innerJoin(people, eq(people.id, shifts.personId))
    .leftJoin(shiftOpenings, eq(shiftOpenings.id, shifts.openingId))
    .leftJoin(volunteerTasks, eq(volunteerTasks.id, shifts.taskId))
    .where(and(eq(shifts.date, tomorrow), inArray(shifts.status, ["scheduled", "confirmed"]), isNull(shifts.reminderSentAt)));
  const claimedShifts = dueShifts.length
    ? new Set(
        (
          await db
            .update(shifts)
            .set({ reminderSentAt: now })
            .where(and(inArray(shifts.id, dueShifts.map((d) => d.shift.id)), isNull(shifts.reminderSentAt)))
            .returning({ id: shifts.id })
        ).map((r) => r.id),
      )
    : new Set<string>();
  let shiftCount = 0;
  for (const d of dueShifts) {
    if (!claimedShifts.has(d.shift.id)) continue;
    shiftCount += 1;
    const shift: ShiftForEmail = { id: d.shift.id, date: d.shift.date, slot: d.shift.slot, title: d.opening?.title ?? d.task?.name ?? "Volunteer", location: d.opening?.location || null, notes: d.opening?.notes || null };
    const built = shiftReminderEmail(ctx, { firstName: d.person.firstName, shift });
    emails.push({ to: d.person.email, ...built, kind: "shift-reminder", personId: d.person.id });
    const phone = d.person.smsConsentAt ? normalizePhone(d.person.phone) : null;
    if (phone) {
      await sendSms(db, { to: phone, body: shiftReminderText(ctx, shift), kind: "shift-reminder", personId: d.person.id });
      texts += 1;
    }
  }

  await queueEmails(db, emails);
  if (emails.length) await sendQueued(db, 100);
  return { events: eventCount, shifts: shiftCount, texts, emails: emails.length };
}

/** Choices for the audience builder: the petitions and pledges, and every tag in use. */
export async function loadAudienceOptions(db: Db): Promise<{ campaigns: { slug: string; title: string }[]; tags: string[] }> {
  const [campaignRows, tagRows] = await Promise.all([
    db.execute<{ slug: string; title: string }>(sql`select slug, title from campaigns order by sort_order, title`),
    db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from people order by 1`),
  ]);
  return { campaigns: campaignRows.map((r) => ({ slug: r.slug, title: r.title })), tags: tagRows.map((r) => r.tag) };
}

// ── The log ───────────────────────────────────────────────────────────────

export type LogFilter = { status?: string; kind?: string; q?: string; limit?: number };

const STATUSES = ["queued", "sent", "failed", "skipped"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (s: string | undefined): s is Status => (STATUSES as readonly string[]).includes(s ?? "");

export async function loadEmailLog(db: Db, f: LogFilter = {}) {
  const conds: SQL[] = [];
  if (isStatus(f.status)) conds.push(eq(emailLog.status, f.status));
  if (f.kind) conds.push(eq(emailLog.kind, f.kind));
  if (f.q) conds.push(or(ilike(emailLog.to, `%${f.q}%`), ilike(emailLog.subject, `%${f.q}%`))!);
  return db
    .select({ id: emailLog.id, to: emailLog.to, kind: emailLog.kind, subject: emailLog.subject, status: emailLog.status, error: emailLog.error, attempts: emailLog.attempts, campaignId: emailLog.campaignId, sentAt: emailLog.sentAt, createdAt: emailLog.createdAt, hasBody: sql<boolean>`${emailLog.html} is not null` })
    .from(emailLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(emailLog.createdAt))
    .limit(f.limit ?? 100);
}

export async function loadSmsLog(db: Db, f: LogFilter = {}) {
  const conds: SQL[] = [];
  if (isStatus(f.status)) conds.push(eq(smsLog.status, f.status));
  if (f.kind) conds.push(eq(smsLog.kind, f.kind));
  if (f.q) conds.push(or(ilike(smsLog.to, `%${f.q}%`), ilike(smsLog.body, `%${f.q}%`))!);
  return db
    .select()
    .from(smsLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(smsLog.createdAt))
    .limit(f.limit ?? 100);
}

export async function logKinds(db: Db): Promise<string[]> {
  const rows = await db.execute<{ kind: string }>(sql`select kind from email_log union select kind from sms_log order by kind`);
  return rows.map((r) => r.kind);
}

export async function commsTotals(db: Db) {
  const [row] = (await db.execute(sql`
    select
      (select count(*) from newsletter_subscribers where status = 'subscribed' and confirmed_at is not null)::int as confirmed,
      (select count(*) from newsletter_subscribers where status = 'pending')::int as pending,
      (select count(*) from newsletter_subscribers where status = 'unsubscribed')::int as unsubscribed,
      (select count(*) from people where sms_consent_at is not null and phone is not null)::int as sms_opt_ins,
      (select count(*) from email_log where status = 'queued')::int as queued,
      (select count(*) from email_log where status = 'failed')::int as failed
  `)) as unknown as { confirmed: number; pending: number; unsubscribed: number; sms_opt_ins: number; queued: number; failed: number }[];
  return row;
}
