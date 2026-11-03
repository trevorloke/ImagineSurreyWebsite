import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { error, json } from "@/lib/server/api";
import { drainQueue, pruneEmailBodies } from "@/lib/server/email";

// Sends anything still queued (campaigns normally drain right after "Send").
// Vercel Cron calls this daily (see vercel.json; any plan allows daily jobs)
// with "Authorization: Bearer $CRON_SECRET"; on a paid plan it can run more often.
// Without CRON_SECRET it only answers requests from the same machine.
// Long enough to work through a backlog; Vercel allows 60 seconds on every plan.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (env.cronSecret ? auth !== `Bearer ${env.cronSecret}` : process.env.VERCEL) return error("Not allowed.", 401);
  const db = getDb();
  const result = await drainQueue(db);
  if (Math.random() < 0.02) await pruneEmailBodies(db);
  return json({ ok: true, ...result });
}
