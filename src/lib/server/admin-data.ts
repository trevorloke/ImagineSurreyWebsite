import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

// Each dataset is one flat query, shared by the admin tables and CSV export.
const QUERIES = {
  members: sql`
    select p.first_name, p.last_name, p.email, p.phone, p.address, p.city, p.postal_code, p.neighbourhood,
           p.birthdate, p.citizenship_status, p.gender, array_to_string(p.languages, '; ') as languages,
           p.student, p.campus, p.issue, p.interest_volunteer, p.interest_lawn_sign,
           m.status, m.voting_eligible, m.fee_cents, m.starts_at, m.expires_at, m.created_at
    from memberships m join people p on p.id = m.person_id
    order by m.created_at desc`,
  contributions: sql`
    select c.paid_at, c.contributor_name, p.email, c.contributor_address, c.contributor_city, c.contributor_postal_code,
           c.kind, c.frequency, c.slate, c.fund, c.amount_cents, c.refunded_cents, c.status,
           c.stripe_payment_intent_id, c.created_at
    from contributions c join people p on p.id = c.person_id
    order by coalesce(c.paid_at, c.created_at) desc`,
  monthly_donors: sql`
    select r.contributor_name, p.email, r.slate_amounts::text as monthly_cents_by_slate, r.status,
           r.stripe_subscription_id, r.created_at, r.cancelled_at
    from recurring_donations r join people p on p.id = r.person_id
    order by r.created_at desc`,
  newsletter: sql`
    select email, status, source, subscribed_at, unsubscribed_at
    from newsletter_subscribers order by subscribed_at desc`,
  signatures: sql`
    select campaign, first_name, last_name, email, postal_code, address, phone, answer, created_at
    from campaign_signatures order by created_at desc`,
  rsvps: sql`
    select e.title as event, e.starts_at, r.name, r.email, r.guests, r.created_at
    from event_rsvps r join events e on e.id = r.event_id
    order by e.starts_at desc, r.created_at`,
  orders: sql`
    select o.created_at, o.paid_at, o.status, o.email, o.total_cents,
           (select string_agg(i.quantity || ' × ' || i.name, '; ') from order_items i where i.order_id = o.id) as items,
           o.shipping::text as shipping
    from orders o where o.status <> 'pending_payment'
    order by o.created_at desc`,
} as const;

export type Dataset = keyof typeof QUERIES;
export const DATASETS = Object.keys(QUERIES) as Dataset[];

export async function loadDataset(db: Db, dataset: Dataset, limit?: number): Promise<Record<string, unknown>[]> {
  const query = limit ? sql`select * from (${QUERIES[dataset]}) t limit ${limit}` : QUERIES[dataset];
  return (await db.execute(query)) as unknown as Record<string, unknown>[];
}

export async function dashboardTotals(db: Db) {
  const [row] = (await db.execute(sql`
    select
      (select count(*) from memberships where status = 'active' and expires_at > now())::int as active_members,
      (select count(*) from newsletter_subscribers where status = 'subscribed')::int as subscribers,
      (select count(*) from recurring_donations where status = 'active')::int as monthly_donors,
      (select coalesce(sum(amount_cents - refunded_cents), 0) from contributions
         where status = 'succeeded' and paid_at >= date_trunc('year', now() at time zone 'America/Vancouver') at time zone 'America/Vancouver')::bigint as raised_this_year_cents,
      (select count(*) from campaign_signatures)::int as signatures,
      (select count(*) from orders where status = 'paid')::int as orders_to_fulfil
  `)) as unknown as Record<string, number>[];
  return row;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\r\n") + "\r\n";
}
