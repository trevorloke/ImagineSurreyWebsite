import "server-only";
import { and, asc, countDistinct, desc, eq, gte, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { nextMilestone } from "@/app/act/milestone";
import { getDb } from "@/lib/db";
import { campaignSignatures, campaigns } from "@/lib/db/schema";
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
  /** Town centres with at least 10 signatures, largest first. */
  byNeighbourhood: { neighbourhood: string; count: number }[];
  /** The town centres of the latest five signatures, no names. */
  latestNeighbourhoods: string[];
};

const NEIGHBOURHOOD_MIN = 10;

async function loadCounts(slug: string): Promise<CampaignCounts> {
  const db = getDb();
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.slug, slug), columns: { goal: true } });
  const signed = countDistinct(campaignSignatures.email);
  const [total] = await db.select({ count: signed }).from(campaignSignatures).where(eq(campaignSignatures.campaign, slug));
  const count = Number(total?.count ?? 0);

  const byNeighbourhood = await db
    .select({ neighbourhood: campaignSignatures.neighbourhood, count: signed })
    .from(campaignSignatures)
    .where(and(eq(campaignSignatures.campaign, slug), isNotNull(campaignSignatures.neighbourhood)))
    .groupBy(campaignSignatures.neighbourhood)
    .having(gte(signed, NEIGHBOURHOOD_MIN))
    .orderBy(desc(signed));

  const latest = await db
    .select({ neighbourhood: campaignSignatures.neighbourhood })
    .from(campaignSignatures)
    .where(eq(campaignSignatures.campaign, slug))
    .orderBy(desc(campaignSignatures.createdAt))
    .limit(5);
  const latestNeighbourhoods: string[] = [];
  for (const row of latest) if (row.neighbourhood && !latestNeighbourhoods.includes(row.neighbourhood)) latestNeighbourhoods.push(row.neighbourhood);

  const goal = campaign?.goal ?? null;
  return {
    count,
    goal,
    milestone: nextMilestone(count, goal),
    byNeighbourhood: byNeighbourhood.map((r) => ({ neighbourhood: r.neighbourhood as string, count: Number(r.count) })),
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
