// Campaign emails: merge fields and the rendering of a Markdown body into a
// personalised message. Pure, so the composer can preview and the tests can
// check it without a database.
import { markdownToText, renderMarkdown } from "@/lib/markdown";
import type { MessageContext } from "./messages";
import { layout, textVersion } from "./templates";

export const MERGE_FIELDS = [
  { name: "first_name", help: "The recipient's first name, or \"neighbour\" when we don't have it." },
  { name: "unsubscribe_url", help: "The recipient's own unsubscribe link. The footer always carries one too." },
  { name: "referral_link", help: "A join link that credits the recipient when a friend signs up through it." },
  { name: "site_url", help: "The site's address." },
] as const;

export type MergeValues = Record<(typeof MERGE_FIELDS)[number]["name"], string>;

export const FIRST_NAME_FALLBACK = "neighbour";

/** Replace {{field}} placeholders. Unknown fields become empty so a typo never reaches a recipient. */
export function mergeFields(template: string, values: Partial<MergeValues>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, name: string) => values[name.toLowerCase() as keyof MergeValues] ?? "");
}

export type CampaignContent = { subject: string; preheader: string; body: string };

/** The personalised email for one recipient. The unsubscribe footer is always present. */
export function renderCampaignEmail(ctx: MessageContext, campaign: CampaignContent, values: MergeValues): { subject: string; html: string; text: string } {
  const subject = mergeFields(campaign.subject, values);
  const markdown = mergeFields(campaign.body, values);
  const html = layout({
    title: subject,
    bodyHtml: renderMarkdown(markdown),
    siteUrl: ctx.siteUrl,
    orgName: ctx.orgName,
    orgEmail: ctx.orgEmail,
    preheader: mergeFields(campaign.preheader, values) || undefined,
    reason: `You're getting this because you asked to hear from ${ctx.orgName}.`,
    unsubscribeUrl: values.unsubscribe_url,
  });
  const text = textVersion([markdownToText(markdown)], { orgName: ctx.orgName, unsubscribeUrl: values.unsubscribe_url });
  return { subject, html, text };
}

/** Sample values for previews and test sends. */
export function sampleMergeValues(ctx: MessageContext, firstName?: string | null): MergeValues {
  return {
    first_name: firstName || FIRST_NAME_FALLBACK,
    unsubscribe_url: `${ctx.siteUrl}/newsletter/unsubscribe?token=preview`,
    referral_link: `${ctx.siteUrl}/?ref=PREVIEW#join`,
    site_url: ctx.siteUrl,
  };
}
