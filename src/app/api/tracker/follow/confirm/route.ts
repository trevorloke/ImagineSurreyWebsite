import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { confirmFollow } from "@/lib/server/tracker";

/** The link in the confirmation email. Lands on /tracker/follow with the outcome in the hash. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const result = token ? await confirmFollow(getDb(), token) : { ok: false as const };
  const target = result.ok ? `/tracker/follow#confirmed-${result.number}` : "/tracker/follow#expired";
  return NextResponse.redirect(new URL(target, env.siteUrl), 303);
}
