"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { emailCampaigns } from "@/lib/db/schema";
import { audienceIsEmpty, parseAudience } from "@/lib/email/audience";
import { STOP_LINE } from "@/lib/email/notifications";
import { ActionError, adminAction, multi, optionalText } from "@/lib/server/actions";
import { can, getAdminUser } from "@/lib/server/admin-auth";
import { cancelCampaign, CommsError, countEmailAudience, countSmsAudience, loadSmsRecipients, queueCampaign, sendCampaignTest, sendSmsBroadcast } from "@/lib/server/comms";
import { drainQueue, requeueEmail, sendQueued } from "@/lib/server/email";

const audienceFields = {
  lists: multi(),
  campaign: optionalText(80),
  neighbourhood: optionalText(40),
  tag: optionalText(60),
  language: optionalText(20),
};

const contentFields = {
  subject: z.string().trim().min(1, "Give the email a subject").max(200, "Keep the subject under 200 characters"),
  preheader: z.string().trim().max(200, "Keep the preview text under 200 characters").optional().default(""),
  body: z.string().trim().min(1, "Write the email").max(50_000, "The email is too long"),
};

function sendingMessage(n: number): string {
  return `Sending to ${n} ${n === 1 ? "person" : "people"}. They go out in batches over the next few minutes.`;
}

/** Background work after the response: never let it throw into the request. */
function later(name: string, fn: () => Promise<unknown>) {
  after(async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`${name} failed`, err);
    }
  });
}

function refresh(id?: string) {
  revalidatePath("/admin/comms");
  if (id) revalidatePath(`/admin/comms/${id}`);
}

export const createCampaign = adminAction(
  "comms",
  z.object({ ...contentFields, ...audienceFields }),
  async (data, { user }) => {
    const [row] = await getDb()
      .insert(emailCampaigns)
      .values({ subject: data.subject, preheader: data.preheader, body: data.body, audience: parseAudience(data), createdById: user.id })
      .returning({ id: emailCampaigns.id });
    refresh(row.id);
    return { ok: true, redirect: `/admin/comms/${row.id}` };
  },
  "campaign.create",
);

/** Save a draft, and depending on the button pressed, send a test to the signed-in admin or send it for real. */
export const saveCampaign = adminAction(
  "comms",
  z.object({ id: z.uuid(), intent: z.enum(["save", "test", "send"]).optional().default("save"), ...contentFields, ...audienceFields }),
  async (data, { user }) => {
    const db = getDb();
    const campaign = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, data.id) });
    if (!campaign) throw new ActionError("That campaign no longer exists.");
    if (campaign.status !== "draft") throw new ActionError("This campaign has been sent and can't be changed.");
    const audience = parseAudience(data);
    await db
      .update(emailCampaigns)
      .set({ subject: data.subject, preheader: data.preheader, body: data.body, audience, updatedAt: new Date() })
      .where(eq(emailCampaigns.id, data.id));
    // Sending swaps the composer for the progress panel: the form navigates
    // there itself (with ?sent=1), so no revalidation that would unmount it
    // before it can. The admin pages are dynamic and always read fresh data.
    if (data.intent !== "send") refresh(data.id);

    if (data.intent === "test") {
      const result = await sendCampaignTest(db, data.id, user.email, user.name.split(/\s+/)[0]);
      if (result.status === "sent") return `Draft saved and a test sent to ${user.email}.`;
      if (result.status === "skipped") return `Draft saved. Email isn't configured yet, so the test to ${user.email} was logged as skipped (see the log).`;
      return { ok: false, error: `Draft saved, but the test email failed: ${result.error ?? "unknown error"}.` };
    }

    if (data.intent === "send") {
      if (audienceIsEmpty(audience)) throw new ActionError("Choose an audience before sending.", { lists: "Choose at least one list or filter" });
      try {
        const n = await queueCampaign(db, data.id);
        later("drainQueue", () => drainQueue(db));
        // The page swaps the composer for the progress panel, which repeats this message.
        return { ok: true, message: sendingMessage(n), redirect: `/admin/comms/${data.id}?sent=1` };
      } catch (err) {
        if (err instanceof CommsError) throw new ActionError(err.message);
        throw err;
      }
    }
    return "Draft saved.";
  },
  "campaign.save",
);

export const cancelCampaignAction = adminAction(
  "comms",
  z.object({ id: z.uuid() }),
  async (data) => {
    const ok = await cancelCampaign(getDb(), data.id);
    if (!ok) throw new ActionError("This campaign can't be cancelled: it has already finished.");
    refresh(data.id);
    return "Campaign cancelled. Anything still queued was skipped.";
  },
  "campaign.cancel",
);

export const deleteDraftAction = adminAction(
  "comms",
  z.object({ id: z.uuid() }),
  async (data) => {
    const rows = await getDb()
      .delete(emailCampaigns)
      .where(and(eq(emailCampaigns.id, data.id), eq(emailCampaigns.status, "draft")))
      .returning({ id: emailCampaigns.id });
    if (rows.length === 0) throw new ActionError("Only drafts can be deleted.");
    refresh();
    return { ok: true, redirect: "/admin/comms" };
  },
  "campaign.delete",
);

const stopLineRe = new RegExp(`${STOP_LINE.replace(/\s+/g, "\\s+")}\\.?$`, "i");

export const sendTextAction = adminAction(
  "comms",
  z.object({ message: z.string().trim().min(1, "Write the text").max(640, "Keep texts under 640 characters (four segments)"), ...audienceFields }),
  async (data) => {
    const message = data.message.trim();
    if (!stopLineRe.test(message)) throw new ActionError(`Texts must end with "${STOP_LINE}".`, { message: `End the text with "${STOP_LINE}"` });
    const audience = parseAudience(data);
    if (audienceIsEmpty(audience)) throw new ActionError("Choose an audience before sending.", { lists: "Choose at least one list or filter" });
    const db = getDb();
    const recipients = await loadSmsRecipients(db, audience);
    if (recipients.length === 0) throw new ActionError("Nobody in this audience has said yes to texts, so there is no one to send to.");
    later("sendSmsBroadcast", () => sendSmsBroadcast(db, recipients, message));
    revalidatePath("/admin/comms/log");
    return `Sending ${recipients.length} ${recipients.length === 1 ? "text" : "texts"}. They show in the log as they go out.`;
  },
  "sms.broadcast",
);

export const resendEmailAction = adminAction(
  "comms",
  z.object({ id: z.uuid() }),
  async (data) => {
    const db = getDb();
    const id = await requeueEmail(db, data.id);
    if (!id) throw new ActionError("Only failed one-off emails whose body is still stored can be re-sent.");
    later("sendQueued", () => sendQueued(db, 10));
    revalidatePath("/admin/comms/log");
    return "Queued again. It goes out with the next batch.";
  },
  "email.resend",
);

/** The live recipient count for the composer. Returns null when the caller may not use the composer. */
export async function countAudienceAction(input: unknown, channel: "email" | "sms"): Promise<number | null> {
  const user = await getAdminUser();
  if (!user || !can(user, "comms")) return null;
  const audience = parseAudience(input);
  const db = getDb();
  return channel === "sms" ? countSmsAudience(db, audience) : countEmailAudience(db, audience);
}
