import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { error, json } from "@/lib/server/api";
import { pruneEmailBodies, sendQueued } from "@/lib/server/email";

// Sends queued emails (campaigns, reminders). Vercel Cron calls this every
// minute (see vercel.json) with "Authorization: Bearer $CRON_SECRET".
// Without CRON_SECRET it only answers requests from the same machine.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (env.cronSecret ? auth !== `Bearer ${env.cronSecret}` : process.env.VERCEL) return error("Not allowed.", 401);
  const db = getDb();
  const result = await sendQueued(db, 300);
  if (Math.random() < 0.02) await pruneEmailBodies(db);
  return json({ ok: true, ...result });
}
