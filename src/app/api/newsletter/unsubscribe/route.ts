import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { unsubscribeByToken } from "@/lib/server/newsletter";

// Works for the button on /newsletter/unsubscribe and for one-click
// List-Unsubscribe-Post from mail clients (token in the query string).
export async function POST(req: NextRequest) {
  let token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    const form = await req.formData().catch(() => null);
    token = String(form?.get("token") ?? "");
  }
  if (token) await unsubscribeByToken(getDb(), token);
  return NextResponse.redirect(new URL("/newsletter/unsubscribe?done=1", req.url), 303);
}

// A plain link to this route (older emails, link scanners, prefetching)
// changes nothing: it shows the page with the button.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const url = new URL("/newsletter/unsubscribe", req.url);
  if (token) url.searchParams.set("token", token);
  return NextResponse.redirect(url, 303);
}
