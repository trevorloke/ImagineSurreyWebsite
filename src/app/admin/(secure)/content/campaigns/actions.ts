"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_PATHS, parseEmailList, SLUG_RE, slugify } from "@/components/admin/content/fields";
import { getDb } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { ActionError, adminAction, checkbox, optionalText } from "@/lib/server/actions";
import { isUniqueViolation } from "@/lib/server/admin-api";
import { invalidate, TAGS } from "@/lib/server/cache";
import { FIXED_CAMPAIGN_SLUGS, signatureCount } from "@/lib/server/content-admin";

const FIELDS = "Please check the highlighted fields.";

const campaignSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(["petition", "pledge"]),
  title: z.string().trim().min(1, "Required").max(200),
  slug: z.string().trim().toLowerCase().max(80).optional().default(""),
  body: z.string().trim().max(10_000).optional().default(""),
  statement: z.string().trim().max(1000).optional().default(""),
  goal: z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 10_000_000), "Enter a whole number."),
  question: optionalText(200),
  shareText: z.string().trim().max(300).optional().default(""),
  targetEmails: z.string().trim().max(5000).optional().default(""),
  imageUrl: optionalText(1000).refine((v) => !v || /^(https?:\/\/|\/)/i.test(v), "Use a full address (https://…) or a path on this site (/uploads/…)."),
  active: checkbox(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const saveCampaign = adminAction(
  "content",
  campaignSchema,
  async (d) => {
    const db = getDb();
    const existing = d.id ? await db.query.campaigns.findFirst({ where: eq(campaigns.id, d.id) }) : undefined;
    if (d.id && !existing) throw new ActionError("That campaign no longer exists.");
    const slug = existing && FIXED_CAMPAIGN_SLUGS.includes(existing.slug) ? existing.slug : d.slug || slugify(d.title);
    if (!SLUG_RE.test(slug)) throw new ActionError(FIELDS, { slug: "Use lowercase letters, numbers and hyphens." });
    const { emails, invalid } = parseEmailList(d.targetEmails);
    if (invalid.length) throw new ActionError(FIELDS, { targetEmails: `Not an email address: ${invalid.slice(0, 3).join(", ")}` });
    const values = {
      slug,
      kind: d.kind,
      title: d.title,
      body: d.body,
      statement: d.statement,
      goal: d.goal,
      question: d.question ?? null,
      shareText: d.shareText,
      targetEmails: emails,
      imageUrl: d.imageUrl ?? null,
      active: d.active,
      sortOrder: d.sortOrder,
      updatedAt: new Date(),
    };
    let id = existing?.id;
    try {
      if (existing) await db.update(campaigns).set(values).where(eq(campaigns.id, existing.id));
      else [{ id }] = await db.insert(campaigns).values(values).returning({ id: campaigns.id });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ActionError(FIELDS, { slug: "Another campaign already uses this address." });
      throw err;
    }
    invalidate(TAGS.pages, TAGS.counters);
    return existing ? { ok: true, message: "Saved." } : { ok: true, redirect: `${ADMIN_PATHS.campaigns}/${id}?saved=created` };
  },
  "campaign.save",
);

export const deleteCampaign = adminAction(
  "content",
  z.object({ id: z.uuid() }),
  async (d) => {
    const db = getDb();
    const existing = await db.query.campaigns.findFirst({ where: eq(campaigns.id, d.id) });
    if (!existing) throw new ActionError("That campaign no longer exists.");
    if (FIXED_CAMPAIGN_SLUGS.includes(existing.slug)) throw new ActionError("This campaign is built into the home page and can't be deleted. Untick 'Active' instead.");
    if ((await signatureCount(db, existing.slug)) > 0) throw new ActionError("This campaign has signatures, so it can't be deleted. Untick 'Active' instead.");
    await db.delete(campaigns).where(eq(campaigns.id, d.id));
    invalidate(TAGS.pages, TAGS.counters);
    return { ok: true, redirect: `${ADMIN_PATHS.campaigns}?deleted=1` };
  },
  "campaign.delete",
);
