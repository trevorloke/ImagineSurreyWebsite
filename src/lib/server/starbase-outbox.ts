import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { after } from "next/server";
import type { Db } from "@/lib/db";
import { people, starbaseOutbox } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { afterAttempt, cleanStarbasePerson, sendPerson, starbaseUrlProblem, stopsRun, type OutboxPatch, type OutboxStatus, type StarbaseAnswer, type StarbasePerson } from "./starbase";

// The outbox between the website and Starbase. A public route only writes a
// row (enqueueStarbase) and asks for delivery after its response
// (deliverSoon); the daily job and the admin "Send now" deliver the rest. So
// Starbase being slow, down or misconfigured never fails or slows a form.
//
// Without STARBASE_URL and STARBASE_KEY rows are still written, as
// "skipped": the admin can see what would have gone, and connecting Starbase
// later sends only what comes in from then on instead of a flood of old
// sign-ups (any of them can still be sent one at a time with Retry).

export type OutboxKind = "petition" | "pledge" | "newsletter" | "volunteer-shift" | "membership" | "deletion-request";
export const OUTBOX_KINDS: OutboxKind[] = ["petition", "pledge", "newsletter", "volunteer-shift", "membership", "deletion-request"];
export const OUTBOX_STATUSES: OutboxStatus[] = ["pending", "sent", "failed", "skipped"];

export type OutboxRow = typeof starbaseOutbox.$inferSelect;

const NOT_CONNECTED = "Starbase isn't connected (STARBASE_URL and STARBASE_KEY), so this wasn't sent.";

/**
 * Write one person for Starbase. Never throws and returns the row id (the
 * Idempotency-Key), or null when nothing was written: the payload couldn't
 * be sent (no email or phone) or the write itself failed.
 */
export async function enqueueStarbase(db: Db, entry: { kind: OutboxKind; personId?: string | null; person: StarbasePerson | null }): Promise<string | null> {
  if (!entry.person) return null;
  try {
    const enabled = env.starbaseEnabled;
    const [row] = await db
      .insert(starbaseOutbox)
      .values({
        kind: entry.kind,
        personId: entry.personId ?? null,
        payload: entry.person as Record<string, unknown>,
        status: enabled ? "pending" : "skipped",
        lastError: enabled ? null : NOT_CONNECTED,
        nextAttemptAt: enabled ? new Date() : null,
      })
      .returning({ id: starbaseOutbox.id });
    return row?.id ?? null;
  } catch (err) {
    console.error("Could not queue a sign-up for Starbase", err);
    return null;
  }
}

/** Deliver what is due once the response has gone. Outside a request (tests, scripts) the daily job picks it up. */
export function deliverSoon(db: Db): void {
  if (!env.starbaseEnabled) return;
  try {
    after(async () => {
      await deliverOutbox(db, 8_000);
    });
  } catch {
    // No request scope: nothing to hang it on.
  }
}

// ── Delivery ───────────────────────────────────────────────────────────────

export type DeliveryReport = { sent: number; failed: number; retrying: number; problem: string | null };

/** What delivery needs from the database, so the loop can be tested without one. */
export interface OutboxStore {
  /** The oldest due pending row (or one of `ids`), leased so no other run sends it at the same time. */
  claimNext(options: { ignoreBackoff: boolean; ids?: string[]; exclude: string[] }): Promise<OutboxRow | null>;
  save(row: OutboxRow, patch: OutboxPatch): Promise<void>;
}

export type DeliverOptions = {
  /** "Send now" in the admin: pending rows go now, whatever their backoff. */
  ignoreBackoff?: boolean;
  /** Only these rows. */
  ids?: string[];
  send?: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<StarbaseAnswer>;
  now?: () => Date;
};

/**
 * Send due pending rows, oldest first, until none are left or `budgetMs` has
 * passed. Stops at the first wrong-key, rate-limit or outage answer (it would
 * be the same for every row). Never throws.
 */
export async function deliverWith(store: OutboxStore, budgetMs: number, options: DeliverOptions = {}): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, failed: 0, retrying: 0, problem: null };
  const send = options.send ?? ((payload, key) => sendPerson(payload, key));
  const now = options.now ?? (() => new Date());
  const started = Date.now();
  const tried: string[] = [];
  try {
    while (Date.now() - started < budgetMs) {
      const row = await store.claimNext({ ignoreBackoff: Boolean(options.ignoreBackoff), ids: options.ids, exclude: tried });
      if (!row) break;
      tried.push(row.id);
      let answer: StarbaseAnswer;
      try {
        answer = await send(row.payload, row.id);
      } catch (err) {
        answer = { kind: "retry", status: null, error: err instanceof Error ? err.message : String(err) };
      }
      const patch = afterAttempt(row, answer, now());
      await store.save(row, patch);
      if (patch.status === "sent") report.sent += 1;
      else if (patch.status === "failed") report.failed += 1;
      else if (answer.kind === "retry") report.retrying += 1;
      if (stopsRun(answer)) {
        report.problem = patch.lastError;
        break;
      }
    }
  } catch (err) {
    console.error("Starbase delivery stopped", err);
    report.problem = err instanceof Error ? err.message : String(err);
  }
  return report;
}

// A claimed row is pushed this far ahead while it is being sent; if the
// process dies mid-send the row simply becomes due again.
const LEASE = sql`now() + interval '5 minutes'`;

export function dbOutboxStore(db: Db): OutboxStore {
  return {
    async claimNext({ ignoreBackoff, ids, exclude }) {
      const conditions: (SQL | undefined)[] = [eq(starbaseOutbox.status, "pending")];
      if (!ignoreBackoff) conditions.push(or(isNull(starbaseOutbox.nextAttemptAt), lte(starbaseOutbox.nextAttemptAt, sql`now()`)));
      if (ids) conditions.push(ids.length ? inArray(starbaseOutbox.id, ids) : sql`false`);
      if (exclude.length) conditions.push(notInArray(starbaseOutbox.id, exclude));
      const next = db
        .select({ id: starbaseOutbox.id })
        .from(starbaseOutbox)
        .where(and(...conditions))
        .orderBy(asc(starbaseOutbox.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      const [row] = await db.update(starbaseOutbox).set({ nextAttemptAt: LEASE }).where(inArray(starbaseOutbox.id, next)).returning();
      return row ?? null;
    },
    async save(row, patch) {
      await db.update(starbaseOutbox).set(patch).where(eq(starbaseOutbox.id, row.id));
      if (patch.starbasePersonId && row.personId) {
        await db.update(people).set({ starbasePersonId: patch.starbasePersonId }).where(eq(people.id, row.personId));
      }
    },
  };
}

/** Deliver from the database. Without Starbase configured it sends nothing and says why. Never throws. */
export async function deliverOutbox(db: Db, budgetMs = 8_000, options: DeliverOptions = {}): Promise<DeliveryReport> {
  if (!env.starbaseEnabled) return { sent: 0, failed: 0, retrying: 0, problem: NOT_CONNECTED };
  const problem = starbaseUrlProblem(env.starbaseUrl);
  if (problem) return { sent: 0, failed: 0, retrying: 0, problem };
  return deliverWith(dbOutboxStore(db), budgetMs, options);
}

// ── Admin ──────────────────────────────────────────────────────────────────

/** Failed or skipped → pending again with a clean slate, then one attempt now. */
export async function retryOutboxRow(db: Db, id: string): Promise<{ row: OutboxRow | null; report: DeliveryReport | null }> {
  const current = await db.query.starbaseOutbox.findFirst({ where: eq(starbaseOutbox.id, id) });
  if (!current) return { row: null, report: null };
  // Cleaned again in case it was written by an older version of the site.
  const payload = (cleanStarbasePerson(current.payload) ?? current.payload) as Record<string, unknown>;
  const [row] = await db
    .update(starbaseOutbox)
    .set({ status: "pending", attempts: 0, lastError: null, nextAttemptAt: new Date(), payload })
    .where(and(eq(starbaseOutbox.id, id), inArray(starbaseOutbox.status, ["failed", "skipped"])))
    .returning();
  if (!row) return { row: current, report: null };
  const report = env.starbaseEnabled ? await deliverOutbox(db, 15_000, { ids: [id] }) : null;
  const fresh = await db.query.starbaseOutbox.findFirst({ where: eq(starbaseOutbox.id, id) });
  return { row: fresh ?? row, report };
}

/** Pending or failed → skipped: staff decided it shouldn't go. */
export async function skipOutboxRow(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(starbaseOutbox)
    .set({ status: "skipped", nextAttemptAt: null, lastError: sql`coalesce(${starbaseOutbox.lastError}, 'Skipped by staff')` })
    .where(and(eq(starbaseOutbox.id, id), inArray(starbaseOutbox.status, ["pending", "failed"])))
    .returning({ id: starbaseOutbox.id });
  return rows.length > 0;
}

export type OutboxStats = {
  counts: Record<OutboxStatus, number>;
  lastError: { message: string; at: Date | null; status: OutboxStatus } | null;
  oldestPendingAt: Date | null;
  lastSentAt: Date | null;
};

export async function outboxStats(db: Db): Promise<OutboxStats> {
  const counts: Record<OutboxStatus, number> = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  const byStatus = await db.select({ status: starbaseOutbox.status, n: count() }).from(starbaseOutbox).groupBy(starbaseOutbox.status);
  for (const r of byStatus) counts[r.status] = Number(r.n);
  const [problem] = await db
    .select({ message: starbaseOutbox.lastError, at: starbaseOutbox.lastAttemptAt, status: starbaseOutbox.status })
    .from(starbaseOutbox)
    .where(and(isNotNull(starbaseOutbox.lastError), isNotNull(starbaseOutbox.lastAttemptAt), inArray(starbaseOutbox.status, ["pending", "failed"])))
    .orderBy(desc(starbaseOutbox.lastAttemptAt))
    .limit(1);
  const [times] = await db
    .select({
      oldestPending: sql<Date | string | null>`min(${starbaseOutbox.createdAt}) filter (where ${starbaseOutbox.status} = 'pending')`,
      lastSent: sql<Date | string | null>`max(${starbaseOutbox.sentAt})`,
    })
    .from(starbaseOutbox);
  const toDate = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)) : null);
  return {
    counts,
    lastError: problem?.message ? { message: problem.message, at: problem.at, status: problem.status } : null,
    oldestPendingAt: toDate(times?.oldestPending),
    lastSentAt: toDate(times?.lastSent),
  };
}

export const OUTBOX_PAGE_SIZE = 50;

export type OutboxFilters = { status: OutboxStatus | ""; kind: OutboxKind | ""; page: number };

export function parseOutboxFilters(sp: Record<string, string | string[] | undefined>): OutboxFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const status = OUTBOX_STATUSES.find((s) => s === one("status")) ?? "";
  const kind = OUTBOX_KINDS.find((k) => k === one("kind")) ?? "";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one("page"), 10) || 1));
  return { status, kind, page };
}

/** The outbox, newest first, with the person's email for the list. */
export async function listOutbox(db: Db, f: OutboxFilters) {
  const where = and(f.status ? eq(starbaseOutbox.status, f.status) : undefined, f.kind ? eq(starbaseOutbox.kind, f.kind) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ row: starbaseOutbox, email: people.email })
      .from(starbaseOutbox)
      .leftJoin(people, eq(people.id, starbaseOutbox.personId))
      .where(where)
      .orderBy(desc(starbaseOutbox.createdAt))
      .limit(OUTBOX_PAGE_SIZE)
      .offset((f.page - 1) * OUTBOX_PAGE_SIZE),
    db.select({ total: count() }).from(starbaseOutbox).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r.row, email: r.email })), total: Number(total) };
}

/** One supporter's rows, newest first, for their admin profile. */
export async function outboxForPerson(db: Db, personId: string, limit = 20): Promise<OutboxRow[]> {
  return db.select().from(starbaseOutbox).where(eq(starbaseOutbox.personId, personId)).orderBy(desc(starbaseOutbox.createdAt)).limit(limit);
}
