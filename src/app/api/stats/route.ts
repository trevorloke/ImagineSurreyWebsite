import { NextResponse, type NextRequest } from "next/server";
import { error } from "@/lib/server/api";
import { rateLimited } from "@/lib/server/api";
import { publicStats, STATS_REVALIDATE_SECONDS } from "@/lib/server/stats";

/** The live counters as JSON, with the counting method. Cached five minutes. */
export async function GET(req: NextRequest) {
  if (rateLimited(req, "stats", 60)) return error("Too many requests. Please wait a minute and try again.", 429);
  const stats = await publicStats();
  return NextResponse.json(stats, { headers: { "cache-control": `public, max-age=${STATS_REVALIDATE_SECONDS}` } });
}
