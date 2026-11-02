import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { parseArea, type Area } from "@/components/shell/area";
import { getDb } from "@/lib/db";
import { events, shiftOpenings, shifts, trackerPromises, trackerUpdates } from "@/lib/db/schema";
import { NEIGHBOURHOODS, neighbourhoodForPostalCode } from "@/lib/neighbourhoods";
import { defaultSettings, type Settings } from "@/lib/settings";
import { todayInSurrey, type Slot } from "@/lib/shifts";
import type { PromiseStatus } from "@/lib/tracker";
import { TAGS } from "./cache";
import { getSettings } from "./settings";

/** The pledge and the petition the home page is built around. */
export const PLEDGE_CAMPAIGN = "stop-mccallum-pledge";
export const PETITION_CAMPAIGN = "skytrain-south-surrey";

export type AreaCounts = { pledge: number; petition: number };

export type HomeLive = {
  members: number;
  pledgeSigners: number;
  petitionSigners: number;
  /** Dates are ISO strings: cached values travel as JSON. */
  nextEvents: { slug: string; title: string; startsAt: string; location: string; neighbourhood: string | null }[];
  nextShift:
    | { kind: "opening"; date: string; slot: Slot; title: string; location: string; neighbourhood: string | null }
    | { kind: "scheduled"; date: string; slot: Slot }
    | null;
  trackerUpdates: { number: number; title: string; status: PromiseStatus; date: string; note: string }[];
  byNeighbourhood: Record<Area, AreaCounts>;
  /** The counts for the area asked for, when one was. */
  local: { area: Area; counts: AreaCounts } | null;
};

async function loadHomeLive(area: Area | null): Promise<HomeLive> {
  const db = getDb();
  const today = todayInSurrey();

  const [memberRows, signerRows, areaRows, eventRows, openingRows, updateRows] = await Promise.all([
    db.execute<{ n: number }>(
      sql`select count(distinct person_id)::int as n from memberships where status = 'active' and (expires_at is null or expires_at > now())`,
    ),
    db.execute<{ campaign: string; n: number }>(
      sql`select campaign, count(distinct lower(email))::int as n from campaign_signatures where campaign in (${PLEDGE_CAMPAIGN}, ${PETITION_CAMPAIGN}) group by campaign`,
    ),
    // Older signatures have no neighbourhood stored; fall back to the postal code.
    db.execute<{ campaign: string; neighbourhood: string | null; fsa: string; n: number }>(
      sql`select campaign, neighbourhood, upper(left(replace(postal_code, ' ', ''), 3)) as fsa, count(distinct lower(email))::int as n
          from campaign_signatures where campaign in (${PLEDGE_CAMPAIGN}, ${PETITION_CAMPAIGN}) group by 1, 2, 3`,
    ),
    db
      .select({ slug: events.slug, title: events.title, startsAt: events.startsAt, location: events.location, neighbourhood: events.neighbourhood })
      .from(events)
      .where(and(eq(events.published, true), gte(events.startsAt, new Date())))
      .orderBy(asc(events.startsAt))
      .limit(2),
    db
      .select({ date: shiftOpenings.date, slot: shiftOpenings.slot, title: shiftOpenings.title, location: shiftOpenings.location, neighbourhood: shiftOpenings.neighbourhood })
      .from(shiftOpenings)
      .where(and(eq(shiftOpenings.published, true), gte(shiftOpenings.date, today)))
      .orderBy(asc(shiftOpenings.date), asc(shiftOpenings.slot))
      .limit(1),
    db
      .select({
        number: trackerPromises.number,
        title: trackerPromises.title,
        status: sql<PromiseStatus>`coalesce(${trackerUpdates.status}, ${trackerPromises.status})`,
        date: trackerUpdates.date,
        note: trackerUpdates.note,
      })
      .from(trackerUpdates)
      .innerJoin(trackerPromises, eq(trackerUpdates.promiseId, trackerPromises.id))
      .orderBy(desc(trackerUpdates.date), desc(trackerUpdates.createdAt))
      .limit(3),
  ]);

  let nextShift: HomeLive["nextShift"] = null;
  if (openingRows[0]) {
    nextShift = { kind: "opening", ...openingRows[0] };
  } else {
    const [scheduled] = await db
      .select({ date: shifts.date, slot: shifts.slot })
      .from(shifts)
      .where(and(gte(shifts.date, today), inArray(shifts.status, ["scheduled", "confirmed"])))
      .orderBy(asc(shifts.date), asc(shifts.slot))
      .limit(1);
    if (scheduled) nextShift = { kind: "scheduled", ...scheduled };
  }

  const byNeighbourhood = Object.fromEntries(NEIGHBOURHOODS.map((n) => [n, { pledge: 0, petition: 0 }])) as Record<Area, AreaCounts>;
  for (const row of areaRows) {
    const where = parseArea(row.neighbourhood) ?? parseArea(neighbourhoodForPostalCode(row.fsa));
    if (!where) continue;
    byNeighbourhood[where][row.campaign === PLEDGE_CAMPAIGN ? "pledge" : "petition"] += row.n;
  }
  const signers = (slug: string) => signerRows.find((r) => r.campaign === slug)?.n ?? 0;

  return {
    members: memberRows[0]?.n ?? 0,
    pledgeSigners: signers(PLEDGE_CAMPAIGN),
    petitionSigners: signers(PETITION_CAMPAIGN),
    nextEvents: eventRows.map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })),
    nextShift,
    trackerUpdates: updateRows,
    byNeighbourhood,
    local: area ? { area, counts: byNeighbourhood[area] } : null,
  };
}

/**
 * The numbers and next steps for the home page's "Act now" rail. Cached for
 * five minutes and dropped early when counters, events or the tracker change.
 * The visitor's area is an argument (never read from cookies in here), so each
 * area has its own entry.
 */
export const homeLive = unstable_cache(loadHomeLive, ["home-live"], {
  tags: [TAGS.counters, TAGS.events, TAGS.tracker],
  revalidate: 300,
});

/**
 * Site settings for the shell. A database outage (or a build without one)
 * falls back to the defaults in code instead of taking every page down.
 */
export async function shellSettings(): Promise<Settings> {
  try {
    return await getSettings();
  } catch (err) {
    console.error("Site settings could not be loaded; using the defaults", err);
    return defaultSettings();
  }
}
