import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Sql } from "postgres";
import type { Db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Permission } from "./admin-auth";

// Every timestamp an export carries is rendered in Pacific time inside SQL,
// so a spreadsheet opened anywhere reads the same as the admin pages.
export const PACIFIC = "America/Vancouver";
// Inlined as a literal rather than bound as a parameter, so Postgres never has
// to guess the parameter's type inside `at time zone`.
const TZ = sql.raw(`'${PACIFIC}'`);

/** `to_char(<column> at time zone Pacific, 'YYYY-MM-DD HH24:MI')` for a raw column reference. */
export function pacific(column: string): SQL {
  return sql`to_char(${sql.raw(column)} at time zone ${TZ}, 'YYYY-MM-DD HH24:MI')`;
}

export type DatasetOptions = {
  /** Shifts only: first date to include (YYYY-MM-DD). */
  from?: string;
  /** Shifts only: last date to include (YYYY-MM-DD). */
  to?: string;
};

// Each dataset is one flat query, shared by the admin tables and CSV export.
// Column names are the CSV header, so keep them stable.
const QUERIES = {
  members: () => sql`
    select p.first_name, p.last_name, p.email, p.phone, p.address, p.city, p.postal_code, p.neighbourhood,
           p.birthdate::text as birthdate, p.citizenship_status, p.gender, array_to_string(p.languages, '; ') as languages,
           p.student, p.campus, p.issue, p.interest_volunteer, p.interest_lawn_sign,
           m.member_name, m.member_address, m.member_city, m.member_postal_code, m.member_neighbourhood,
           case when m.status = 'active' and m.expires_at <= now() then 'expired' else m.status::text end as status,
           m.voting_eligible, m.fee_cents, ${pacific("m.starts_at")} as starts_at, ${pacific("m.expires_at")} as expires_at, ${pacific("m.created_at")} as created_at
    from memberships m join people p on p.id = m.person_id
    order by m.created_at desc`,
  contributions: () => sql`
    select ${pacific("c.paid_at")} as paid_at, c.contributor_name, p.email, c.contributor_address, c.contributor_city, c.contributor_postal_code,
           c.kind, c.frequency, c.slate, c.fund, c.amount_cents, c.refunded_cents, c.status,
           c.stripe_payment_intent_id, ${pacific("c.created_at")} as created_at
    from contributions c join people p on p.id = c.person_id
    order by coalesce(c.paid_at, c.created_at) desc`,
  monthly_donors: () => sql`
    select r.contributor_name, p.email, r.slate_amounts::text as monthly_cents_by_slate, r.status,
           r.stripe_subscription_id, ${pacific("r.created_at")} as created_at, ${pacific("r.cancelled_at")} as cancelled_at
    from recurring_donations r join people p on p.id = r.person_id
    order by r.created_at desc`,
  newsletter: () => sql`
    select email, status, source, ${pacific("subscribed_at")} as subscribed_at, ${pacific("confirmed_at")} as confirmed_at,
           ${pacific("unsubscribed_at")} as unsubscribed_at,
           ${`${env.siteUrl}/newsletter/unsubscribe?token=`}::text || unsubscribe_token as unsubscribe_url
    from newsletter_subscribers order by subscribed_at desc`,
  signatures: () => sql`
    select campaign, first_name, last_name, email, postal_code, neighbourhood, address, phone, answer, source, ${pacific("created_at")} as created_at
    from campaign_signatures order by created_at desc`,
  rsvps: () => sql`
    select e.title as event, ${pacific("e.starts_at")} as starts_at, r.name, r.email, r.guests, r.source,
           ${pacific("r.checked_in_at")} as checked_in_at, ${pacific("r.created_at")} as created_at
    from event_rsvps r join events e on e.id = r.event_id
    order by e.starts_at desc, r.created_at`,
  shifts: (o: DatasetOptions) => sql`
    select s.date::text as date, s.slot, coalesce(nullif(concat_ws(' ', p.first_name, p.last_name), ''), p.email) as volunteer, p.email, p.phone,
           t.name as task, s.status, o.title as opening, ${pacific("s.created_at")} as created_at
    from shifts s join people p on p.id = s.person_id
         left join volunteer_tasks t on t.id = s.task_id
         left join shift_openings o on o.id = s.opening_id
    where (${o.from ?? null}::date is null or s.date >= ${o.from ?? null}::date)
      and (${o.to ?? null}::date is null or s.date <= ${o.to ?? null}::date)
    order by s.date, array_position(array['morning','afternoon','evening'], s.slot::text), volunteer`,
  orders: () => sql`
    select ${pacific("o.created_at")} as created_at, ${pacific("o.paid_at")} as paid_at, o.status, o.email, o.total_cents,
           (select string_agg(i.quantity || ' × ' || i.name, '; ' order by i.name) from order_items i where i.order_id = o.id) as items,
           o.shipping->>'name' as ship_to,
           concat_ws(', ', o.shipping->'address'->>'line1', o.shipping->'address'->>'line2', o.shipping->'address'->>'city',
                     o.shipping->'address'->>'state', o.shipping->'address'->>'postal_code') as ship_address,
           o.shipping->>'phone' as ship_phone, o.stripe_payment_intent_id
    from orders o where o.status <> 'pending_payment'
    order by o.created_at desc`,
} as const;

export type Dataset = keyof typeof QUERIES;
export const DATASETS = Object.keys(QUERIES) as Dataset[];

/** Money datasets hold contributor records; the rest are supporter lists. */
export function datasetPermission(dataset: Dataset): Permission {
  return dataset === "contributions" || dataset === "monthly_donors" || dataset === "orders" ? "money" : "people";
}

export function datasetQuery(dataset: Dataset, options: DatasetOptions = {}): SQL {
  return QUERIES[dataset](options);
}

export async function loadDataset(db: Db, dataset: Dataset, limit?: number, options: DatasetOptions = {}): Promise<Record<string, unknown>[]> {
  const base = datasetQuery(dataset, options);
  const query = limit ? sql`select * from (${base}) t limit ${limit}` : base;
  return (await db.execute(query)) as unknown as Record<string, unknown>[];
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export type DashboardTotals = {
  active_members: number;
  monthly_donors: number;
  raised_this_year_cents: number;
  subscribers: number;
  signatures: number;
  volunteers_this_week: number;
  orders_to_fulfil: number;
};

const PAID = sql`status in ('succeeded', 'refunded', 'refunded_over_limit')`;
// Today's date in Surrey, and the Sunday that starts this week.
const TODAY = sql`(now() at time zone ${TZ})::date`;
const WEEK_START = sql`(${TODAY} - extract(dow from ${TODAY})::int)`;
const YEAR_START = sql`date_trunc('year', now() at time zone ${TZ}) at time zone ${TZ}`;

/**
 * The stat tiles. Each is a distinct count of people (one person with two
 * membership rows is one member) and money is net of refunds, for the
 * Pacific calendar year.
 */
export async function dashboardTotals(db: Db): Promise<DashboardTotals> {
  const [row] = (await db.execute(sql`
    select
      (select count(distinct person_id) from memberships where status = 'active' and expires_at > now())::int as active_members,
      (select count(distinct person_id) from recurring_donations where status = 'active')::int as monthly_donors,
      (select coalesce(sum(amount_cents - refunded_cents), 0) from contributions
         where ${PAID} and paid_at >= ${YEAR_START})::bigint as raised_this_year_cents,
      (select count(*) from newsletter_subscribers where status = 'subscribed')::int as subscribers,
      (select count(*) from campaign_signatures)::int as signatures,
      (select count(distinct person_id) from shifts
         where status <> 'cancelled' and date >= ${WEEK_START} and date < ${WEEK_START} + 7)::int as volunteers_this_week,
      (select count(*) from orders where status = 'paid')::int as orders_to_fulfil
  `)) as unknown as Record<string, number | string>[];
  return {
    active_members: Number(row.active_members),
    monthly_donors: Number(row.monthly_donors),
    raised_this_year_cents: Number(row.raised_this_year_cents),
    subscribers: Number(row.subscribers),
    signatures: Number(row.signatures),
    volunteers_this_week: Number(row.volunteers_this_week),
    orders_to_fulfil: Number(row.orders_to_fulfil),
  };
}

export type WeekPoint = { weekStart: string; newSupporters: number; contributions: number; raisedCents: number };

/** The last 12 weeks (Sunday to Saturday, Pacific), oldest first, for the sparklines. */
export async function weeklyTrend(db: Db, weeks = 12): Promise<WeekPoint[]> {
  const rows = (await db.execute(sql`
    with weeks as (
      select (${WEEK_START} - 7 * s)::date as week_start from generate_series(${weeks - 1}::int, 0, -1) as s
    )
    select w.week_start::text as week_start,
      (select count(*) from people p
         where (p.created_at at time zone ${TZ})::date >= w.week_start
           and (p.created_at at time zone ${TZ})::date < w.week_start + 7)::int as new_supporters,
      (select count(*) from contributions c
         where c.${PAID} and (c.paid_at at time zone ${TZ})::date >= w.week_start
           and (c.paid_at at time zone ${TZ})::date < w.week_start + 7)::int as contributions,
      (select coalesce(sum(c.amount_cents - c.refunded_cents), 0) from contributions c
         where c.${PAID} and (c.paid_at at time zone ${TZ})::date >= w.week_start
           and (c.paid_at at time zone ${TZ})::date < w.week_start + 7)::bigint as raised_cents
    from weeks w order by w.week_start
  `)) as unknown as Record<string, string | number>[];
  return rows.map((r) => ({
    weekStart: String(r.week_start),
    newSupporters: Number(r.new_supporters),
    contributions: Number(r.contributions),
    raisedCents: Number(r.raised_cents),
  }));
}

export type Attention = { failedEmailsToday: number; ordersToFulfil: number; stalePendingMemberships: number; overduePromises: number; deskGiftsToLog: number; starbaseFailed: number };

/** Things an organizer should look at today. */
export async function needsAttention(db: Db): Promise<Attention> {
  const [row] = (await db.execute(sql`
    select
      (select count(*) from email_log where status = 'failed' and created_at >= (${TODAY}::timestamp at time zone ${TZ}))::int as failed_emails_today,
      (select count(*) from orders where status = 'paid')::int as orders_to_fulfil,
      (select count(*) from memberships where status = 'pending_payment' and created_at < now() - interval '1 hour')::int as stale_pending_memberships,
      (select count(*) from tracker_promises where target_date < ${TODAY} and status not in ('kept', 'broken'))::int as overdue_promises,
      (select count(*) from contributions where status in ('succeeded', 'refunded', 'refunded_over_limit') and paid_at is not null and desk_logged_at is null)::int as desk_gifts_to_log,
      (select count(*) from starbase_outbox where status = 'failed')::int as starbase_failed
  `)) as unknown as Record<string, number>[];
  return {
    failedEmailsToday: Number(row.failed_emails_today),
    ordersToFulfil: Number(row.orders_to_fulfil),
    stalePendingMemberships: Number(row.stale_pending_memberships),
    overduePromises: Number(row.overdue_promises),
    deskGiftsToLog: Number(row.desk_gifts_to_log),
    starbaseFailed: Number(row.starbase_failed),
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(headers: string[], row: Record<string, unknown>): string {
  return headers.map((h) => csvCell(row[h])).join(",") + "\r\n";
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return headers.join(",") + "\r\n" + rows.map((r) => csvLine(headers, r)).join("");
}

const dialect = new PgDialect();
const CURSOR_ROWS = 500;

/**
 * Run a query through a server-side cursor and write it out as CSV, a batch
 * at a time, so an export of the whole supporter list never sits in memory.
 * The statement is described first: a bad query fails here, before any
 * response headers go out, and the header row is known even for no rows.
 */
export async function csvStream(db: Db, query: SQL): Promise<ReadableStream<Uint8Array>> {
  const { sql: text, params } = dialect.sqlToQuery(query);
  const client = (db as unknown as { $client: Sql }).$client;
  const parameters = params as Parameters<Sql["unsafe"]>[1];
  const headers = (await client.unsafe(text, parameters).describe()).columns.map((c) => c.name);
  const encoder = new TextEncoder();
  let batches: AsyncIterator<Record<string, unknown>[]> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(headers.join(",") + "\r\n"));
    },
    async pull(controller) {
      batches ??= client.unsafe(text, parameters).cursor(CURSOR_ROWS)[Symbol.asyncIterator]() as AsyncIterator<Record<string, unknown>[]>;
      const next = await batches.next();
      if (next.done) {
        controller.close();
        return;
      }
      let chunk = "";
      for (const row of next.value) chunk += csvLine(headers, row);
      controller.enqueue(encoder.encode(chunk));
    },
    async cancel() {
      await batches?.return?.();
    },
  });
}

export function csvResponse(stream: ReadableStream<Uint8Array>, name: string): Response {
  const date = new Date().toLocaleDateString("en-CA", { timeZone: PACIFIC });
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="imagine-surrey-${name}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
