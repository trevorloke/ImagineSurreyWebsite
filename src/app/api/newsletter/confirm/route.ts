import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { confirmSubscription, type ConfirmResult } from "@/lib/server/newsletter";

// The link in the double opt-in email. One click subscribes the address and
// records contact consent; a used or expired link explains itself, and an
// address that unsubscribed in the meantime stays unsubscribed.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  let result: ConfirmResult = "invalid";
  try {
    if (token) result = await confirmSubscription(getDb(), token);
  } catch (err) {
    console.error("newsletter confirmation failed", err);
  }
  const target = result === "subscribed" ? "/newsletter/confirmed" : result === "unsubscribed" ? "/newsletter/confirmed?unsubscribed=1" : "/newsletter/confirmed?invalid=1";
  return NextResponse.redirect(new URL(target, req.url), 303);
}
