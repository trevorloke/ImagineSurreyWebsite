import "server-only";
import { and, asc, countDistinct, desc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { nextMilestone } from "@/app/act/milestone";
import { getDb } from "@/lib/db";
import { campaignSignatures, campaigns } from "@/lib/db/schema";
import { NEIGHBOURHOODS, TOWN_CENTRE_MINIMUM, townCentreFor } from "@/lib/neighbourhoods";
import { cached, TAGS } from "./cache";

// Petitions and pledges come from the `campaigns` table, so organizers launch
// a new one from the admin. Content is cached with the pages tag (an hour, or
// until the admin saves); counts refresh every minute and the moment someone
// signs (the signatures route invalidates TAGS.counters).

export type Campaign = typeof campaigns.$inferSelect;

export const listActiveCampaigns = cached("campaigns-active", [TAGS.pages], async (): Promise<Campaign[]> => {
  return getDb().select().from(campaigns).where(eq(campaigns.active, true)).orderBy(asc(campaigns.sortOrder), asc(campaigns.title));
});

/** An active campaign by slug, or null (inactive campaigns are closed to the public). */
export const getCampaign = cached("campaign", [TAGS.pages], async (slug: string): Promise<Campaign | null> => {
  const row = await getDb().query.campaigns.findFirst({ where: and(eq(campaigns.slug, slug), eq(campaigns.active, true)) });
  return row ?? null;
});

export type CampaignCounts = {
  /** Distinct email addresses that signed. */
  count: number;
  goal: number | null;
  /** The number to aim for next: the goal, then every 500 beyond it. */
  milestone: number;
  /** Town centres with at least 10 signers, largest first. */
  byNeighbourhood: { neighbourhood: string; count: number }[];
  /** The town centres of the latest five signatures, no names, and only town centres that themselves have at least 10 signers. */
  latestNeighbourhoods: string[];
};

/**
 * Per-town-centre counts from (stored town centre, postal-code prefix, signers)
 * groups, filed the way /stats files them. Only Surrey town centres with at
 * least TOWN_CENTRE_MINIMUM signers are shown, largest first.
 */
export function townCentreCounts(groups: { neighbourhood: string | null; fsa: string | null; n: number }[]): { neighbourhood: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const g of groups) {
    const town = townCentreFor(g.neighbourhood, g.fsa);
    totals.set(town, (totals.get(town) ?? 0) + g.n);
  }
  return [...totals]
    .filter(([town, n]) => (NEIGHBOURHOODS as readonly string[]).includes(town) && n >= TOWN_CENTRE_MINIMUM)
    .map(([neighbourhood, count]) => ({ neighbourhood, count }))
    .sort((a, b) => b.count - a.count);
}

/** The latest signatures' town centres, in order, without repeats, limited to town centres already shown. */
export function latestTownCentres(latest: { neighbourhood: string | null; postalCode: string | null }[], shown: Set<string>): string[] {
  const out: string[] = [];
  for (const row of latest) {
    const town = townCentreFor(row.neighbourhood, row.postalCode);
    if (shown.has(town) && !out.includes(town)) out.push(town);
  }
  return out;
}

async function loadCounts(slug: string): Promise<CampaignCounts> {
  const db = getDb();
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.slug, slug), columns: { goal: true } });
  const signed = countDistinct(campaignSignatures.email);
  const [total] = await db.select({ count: signed }).from(campaignSignatures).where(eq(campaignSignatures.campaign, slug));
  const count = Number(total?.count ?? 0);

  const fsa = sql<string | null>`upper(left(replace(${campaignSignatures.postalCode}, ' ', ''), 3))`;
  const groups = await db
    .select({ neighbourhood: campaignSignatures.neighbourhood, fsa, n: sql<number>`count(distinct lower(${campaignSignatures.email}))::int` })
    .from(campaignSignatures)
    .where(eq(campaignSignatures.campaign, slug))
    .groupBy(campaignSignatures.neighbourhood, fsa);
  const byNeighbourhood = townCentreCounts(groups);

  const latest = await db
    .select({ neighbourhood: campaignSignatures.neighbourhood, postalCode: campaignSignatures.postalCode })
    .from(campaignSignatures)
    .where(eq(campaignSignatures.campaign, slug))
    .orderBy(desc(campaignSignatures.createdAt))
    .limit(5);
  const latestNeighbourhoods = latestTownCentres(latest, new Set(byNeighbourhood.map((r) => r.neighbourhood)));

  const goal = campaign?.goal ?? null;
  return {
    count,
    goal,
    milestone: nextMilestone(count, goal),
    byNeighbourhood,
    latestNeighbourhoods,
  };
}

/** Live-enough counts: cached for a minute and dropped when someone signs. */
export const campaignCounts = unstable_cache(loadCounts, ["campaign-counts"], { tags: [TAGS.counters], revalidate: 60 });

/** The distinct-email count right now, for the response to the person who just signed. */
export async function countSignatures(slug: string): Promise<number> {
  const [row] = await getDb().select({ count: countDistinct(campaignSignatures.email) }).from(campaignSignatures).where(eq(campaignSignatures.campaign, slug));
  return Number(row?.count ?? 0);
}
