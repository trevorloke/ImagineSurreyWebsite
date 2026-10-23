import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";

// Works for the button on /newsletter/unsubscribe and for one-click
// List-Unsubscribe-Post from mail clients (token in the query string).
export async function POST(req: NextRequest) {
  let token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    const form = await req.formData().catch(() => null);
    token = String(form?.get("token") ?? "");
  }
  if (token) {
    await getDb()
      .update(newsletterSubscribers)
      .set({ status: "unsubscribed", unsubscribedAt: new Date() })
      .where(and(eq(newsletterSubscribers.unsubscribeToken, token), eq(newsletterSubscribers.status, "subscribed")));
  }
  return NextResponse.redirect(new URL("/newsletter/unsubscribe?done=1", req.url), 303);
}
