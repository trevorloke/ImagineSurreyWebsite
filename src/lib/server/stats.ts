import "server-only";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db";
import { CAMPAIGN_SLUGS, nextMilestone, pacificWeek } from "@/lib/engagement";
import { NEIGHBOURHOODS, OUTSIDE_SURREY, TOWN_CENTRE_MINIMUM, townCentreFor } from "@/lib/neighbourhoods";
import { todayInSurrey } from "@/lib/shifts";
import { TAGS } from "./cache";

// Live counters for the home page and /stats. Honest by construction: every
// number is a count of real rows with a published definition (`method`), it
// goes down as well as up, and small town-centre numbers are withheld so a
// signer on a quiet street can't be picked out.

export const STATS_REVALIDATE_SECONDS = 300;
export { TOWN_CENTRE_MINIMUM };
export const TOWN_CENTRES = [...NEIGHBOURHOODS, OUTSIDE_SURREY] as const;

export type TownCentreCount = number | { suppressed: true };

export type CampaignStats = {
  slug: string;
  title: string;
  kind: "petition" | "pledge";
  /** Distinct email addresses. */
  count: number;
  goal: number | null;
  /** The goal, or once it is passed, the next multiple of 500 above the count. */
  milestone: number;
  byTownCentre: Record<string, TownCentreCount>;
};

export type PublicStats = {
  generatedAt: string;
  refreshSeconds: number;
  townCentreMinimum: number;
  method: string;
  members: number;
  pledge: number;
  petition: number;
  newsletter: number;
  volunteers: number;
  shiftsThisWeek: number;
  week: { start: string; end: string };
  monthlyDonors: number;
  campaigns: CampaignStats[];
};

export const COUNTING_METHOD =
  "Members: memberships that are paid and not yet expired, one per person. " +
  "Pledge and petition: distinct email addresses per campaign, so signing twice counts once. " +
  "Newsletter: addresses that have confirmed their subscription; pending and unsubscribed addresses are not counted. " +
  "Volunteers: people who asked to volunteer or were tagged as volunteers by an organizer. " +
  "Shifts this week: volunteer shifts scheduled, confirmed or attended in the current Sunday-to-Saturday week, Pacific time. " +
  "Monthly donors: active monthly gifts, one per person. " +
  "Town centres come from each signer's postal code, and a town centre is shown only once it has at least 10 signers. " +
  `Numbers refresh every ${STATS_REVALIDATE_SECONDS / 60} minutes and are never rounded up: when a membership lapses or someone unsubscribes, the number goes down. ` +
  "Corrections are noted on this page.";

type Totals = { members: number; newsletter: number; volunteers: number; shifts_this_week: number; monthly_donors: number };
type CampaignRow = { slug: string; title: string; kind: "petition" | "pledge"; goal: number | null };
type CountRow = { campaign: string; n: number };
type TownRow = { campaign: string; neighbourhood: string | null; fsa: string | null; n: number };

async function computeStats(): Promise<PublicStats> {
  const db = getDb();
  const now = new Date();
  const week = pacificWeek(todayInSurrey(now));

  const [totals] = (await db.execute(sql`
    select
      (select count(distinct person_id) from memberships where status = 'active' and (expires_at is null or expires_at > now()))::int as members,
      (select count(*) from newsletter_subscribers where status = 'subscribed')::int as newsletter,
      (select count(*) from people where interest_volunteer or exists (select 1 from unnest(tags) tag where tag like 'vol:%'))::int as volunteers,
      (select count(*) from shifts where date >= ${week.start} and date <= ${week.end} and status in ('scheduled', 'confirmed', 'attended'))::int as shifts_this_week,
      (select count(distinct person_id) from recurring_donations where status = 'active')::int as monthly_donors
  `)) as unknown as Totals[];

  const campaignRows = (await db.execute(sql`select slug, title, kind, goal from campaigns where active order by sort_order, created_at`)) as unknown as CampaignRow[];
  // The two the site was built around are always reported, even before they are seeded.
  for (const [kind, slug] of [["pledge", CAMPAIGN_SLUGS.pledge], ["petition", CAMPAIGN_SLUGS.petition]] as const) {
    if (!campaignRows.some((c) => c.slug === slug)) campaignRows.push({ slug, title: slug, kind, goal: null });
  }
  const slugs = campaignRows.map((c) => c.slug);

  const counts = (await db.execute(sql`
    select campaign, count(distinct lower(email))::int as n from campaign_signatures where campaign in ${slugs} group by campaign
  `)) as unknown as CountRow[];
  const towns = (await db.execute(sql`
    select campaign, neighbourhood, upper(left(replace(postal_code, ' ', ''), 3)) as fsa, count(distinct lower(email))::int as n
    from campaign_signatures where campaign in ${slugs} group by 1, 2, 3
  `)) as unknown as TownRow[];

  const campaigns: CampaignStats[] = campaignRows.map((c) => {
    const count = counts.find((r) => r.campaign === c.slug)?.n ?? 0;
    const raw: Record<string, number> = {};
    for (const row of towns) {
      if (row.campaign !== c.slug) continue;
      const town = townCentreFor(row.neighbourhood, row.fsa);
      raw[town] = (raw[town] ?? 0) + row.n;
    }
    const byTownCentre: Record<string, TownCentreCount> = {};
    for (const town of TOWN_CENTRES) {
      const n = raw[town] ?? 0;
      byTownCentre[town] = n >= TOWN_CENTRE_MINIMUM ? n : { suppressed: true };
    }
    return { slug: c.slug, title: c.title, kind: c.kind, count, goal: c.goal, milestone: nextMilestone(count, c.goal), byTownCentre };
  });

  return {
    generatedAt: now.toISOString(),
    refreshSeconds: STATS_REVALIDATE_SECONDS,
    townCentreMinimum: TOWN_CENTRE_MINIMUM,
    method: COUNTING_METHOD,
    members: totals.members,
    pledge: campaigns.find((c) => c.slug === CAMPAIGN_SLUGS.pledge)?.count ?? 0,
    petition: campaigns.find((c) => c.slug === CAMPAIGN_SLUGS.petition)?.count ?? 0,
    newsletter: totals.newsletter,
    volunteers: totals.volunteers,
    shiftsThisWeek: totals.shifts_this_week,
    week,
    monthlyDonors: totals.monthly_donors,
    campaigns,
  };
}

/**
 * The public numbers, cached for five minutes and thrown away early when a
 * write calls `invalidate(TAGS.counters)`. The shared `cached()` helper fixes
 * an hour, which is too stale for a counter people watch move.
 */
const cachedStats = unstable_cache(computeStats, ["public-stats"], { tags: [TAGS.counters], revalidate: STATS_REVALIDATE_SECONDS });

export function publicStats(): Promise<PublicStats> {
  // A page prerendered during `next build` reads the numbers straight from the
  // database, so the build's snapshot is never stored and served for the next
  // five minutes of real traffic.
  if (process.env.NEXT_PHASE === "phase-production-build") return computeStats();
  return cachedStats();
}
