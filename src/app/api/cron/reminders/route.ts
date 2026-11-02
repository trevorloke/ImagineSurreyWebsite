import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { error, json } from "@/lib/server/api";
import { sendReminders } from "@/lib/server/comms";

// Day-before reminders for event RSVPs and volunteer shifts. Vercel Cron
// calls this every hour (see vercel.json) with "Authorization: Bearer
// $CRON_SECRET". Without CRON_SECRET it only answers requests from the same
// machine, like /api/cron/email.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (env.cronSecret ? auth !== `Bearer ${env.cronSecret}` : process.env.VERCEL) return error("Not allowed.", 401);
  const result = await sendReminders(getDb());
  return json({ ok: true, ...result });
}
