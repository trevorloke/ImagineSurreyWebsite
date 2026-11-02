import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { error } from "@/lib/server/api";
import { can } from "@/lib/server/admin-auth";
import { adminOnly } from "@/lib/server/admin-api";
import { DATASETS, loadDataset, toCsv, type Dataset } from "@/lib/server/admin-data";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/export/[dataset]">) {
  const auth = await adminOnly();
  if (!auth.ok) return auth.response;
  const { dataset } = await ctx.params;
  if (!DATASETS.includes(dataset as Dataset)) return error("Unknown dataset.", 404);
  // Money datasets hold contributor records; the rest are supporter lists.
  const needed = ["contributions", "monthly_donors", "orders"].includes(dataset) ? "money" : "people";
  if (!can(auth.user, needed)) return error("Your role can't export that.", 403);
  const csv = toCsv(await loadDataset(getDb(), dataset as Dataset));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="imagine-surrey-${dataset}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
