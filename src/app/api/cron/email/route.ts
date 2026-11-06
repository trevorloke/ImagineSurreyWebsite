import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { error, json } from "@/lib/server/api";
import { drainQueue, pruneEmailBodies } from "@/lib/server/email";
import { deliverOutbox } from "@/lib/server/starbase-outbox";

// Sends anything still queued (campaigns normally drain right after "Send"),
// then anything still waiting for Starbase (sign-ups normally go right after
// the form; this catches retries and outages). It shares this job instead of
// having its own because vercel.json crons must stay at most once a day on
// the Hobby plan.
// Vercel Cron calls this daily (see vercel.json; any plan allows daily jobs)
// with "Authorization: Bearer $CRON_SECRET"; on a paid plan it can run more often.
// Without CRON_SECRET it only answers requests from the same machine.
// Long enough to work through a backlog; Vercel allows 60 seconds on every plan.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (env.cronSecret ? auth !== `Bearer ${env.cronSecret}` : process.env.VERCEL) return error("Not allowed.", 401);
  const db = getDb();
  const started = Date.now();
  const result = await drainQueue(db, 35_000);
  if (Math.random() < 0.02) await pruneEmailBodies(db);
  // The time the email left, within the 60 seconds; deliverOutbox never throws.
  const starbase = await deliverOutbox(db, Math.max(5_000, 45_000 - (Date.now() - started)));
  return json({ ok: true, ...result, starbase });
}
