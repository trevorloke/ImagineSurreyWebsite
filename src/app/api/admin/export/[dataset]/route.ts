import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { error } from "@/lib/server/api";
import { isAdmin } from "@/lib/server/admin-auth";
import { DATASETS, loadDataset, toCsv, type Dataset } from "@/lib/server/admin-data";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/export/[dataset]">) {
  if (!(await isAdmin())) return error("Not signed in.", 401);
  const { dataset } = await ctx.params;
  if (!DATASETS.includes(dataset as Dataset)) return error("Unknown dataset.", 404);
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
