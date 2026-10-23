import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { json } from "@/lib/server/api";
import { adminOnly } from "@/lib/server/admin-api";
import { searchPeople } from "@/lib/server/shifts";

export async function GET(req: NextRequest) {
  const denied = await adminOnly();
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  return json(q.length < 2 ? [] : await searchPeople(getDb(), q));
}
