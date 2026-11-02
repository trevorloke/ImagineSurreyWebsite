"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { esc, layout, paragraph, textVersion } from "@/lib/email/templates";
import { ActionError, adminAction } from "@/lib/server/actions";
import { sendEmail } from "@/lib/server/email";
import { getSettings } from "@/lib/server/settings";
import { normalizePhone, sendSms } from "@/lib/server/sms";

/** A test message to the signed-in admin's own address, through the same path every site email takes. */
export const sendTestEmail = adminAction(
  "integrations",
  z.object({}),
  async (_d, { user }) => {
    const settings = await getSettings();
    const org = settings.org;
    const when = new Date().toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" });
    const bodyHtml =
      paragraph(`This is a test from the ${esc(org.name)} admin, sent ${esc(when)} (Surrey time). If you're reading it, email sending works.`) +
      paragraph(`Sender: ${esc(env.emailFrom)}${env.emailReplyTo ? ` · Reply-to: ${esc(env.emailReplyTo)}` : ""}`);
    const result = await sendEmail(getDb(), {
      to: user.email,
      subject: `${org.name} test email`,
      html: layout({ title: "Test email", bodyHtml, siteUrl: env.siteUrl, orgName: org.name, orgEmail: org.email, reason: "Sent from the admin Integrations page." }),
      text: textVersion([`This is a test from the ${org.name} admin, sent ${when} (Surrey time).`, `Sender: ${env.emailFrom}`], { orgName: org.name }),
      kind: "test",
    });
    if (result.status === "sent") return `Sent to ${user.email}. Check your inbox (and the spam folder, the first time).`;
    if (result.status === "skipped") throw new ActionError("Email isn't configured: RESEND_API_KEY is not set, so the message was logged as skipped.");
    throw new ActionError(`The email provider refused the message: ${result.error ?? "unknown error"}`);
  },
  "integrations.test-email",
);

export const sendTestSms = adminAction(
  "integrations",
  z.object({ to: z.string().trim().min(7, "Enter a phone number.").max(30) }),
  async (d) => {
    if (!env.smsEnabled) throw new ActionError("Text messages aren't configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.");
    const to = normalizePhone(d.to);
    if (!to) throw new ActionError("Please check the highlighted fields.", { to: "Enter a Canadian phone number, like 604 555 0100." });
    const settings = await getSettings();
    const result = await sendSms(getDb(), { to, body: `Test text from the ${settings.org.name} admin. Texting works. Reply STOP to opt out`, kind: "test" });
    if (result.status === "sent") return `Sent to ${to}.`;
    throw new ActionError(`The text could not be sent: ${result.error ?? "unknown error"}`);
  },
  "integrations.test-sms",
);
