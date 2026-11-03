import { NextResponse, type NextRequest } from "next/server";
import { error, rateLimited } from "@/lib/server/api";
import { campaignCounts, getCampaign } from "@/lib/server/campaigns";
import { CAMPAIGN_SLUG_RE } from "@/lib/validation";

/** Live counts for a campaign, for the page and for anything embedding the counter. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/campaigns/[slug]/count">) {
  if (rateLimited(req, "campaign-count", 60)) return error("Too many requests. Please wait a minute and try again.", 429);
  const { slug } = await ctx.params;
  if (!CAMPAIGN_SLUG_RE.test(slug)) return error("Unknown campaign", 404);
  const campaign = await getCampaign(slug);
  if (!campaign) return error("Unknown campaign", 404);
  const counts = await campaignCounts(slug);
  return NextResponse.json(counts, { headers: { "cache-control": "public, max-age=60" } });
}
