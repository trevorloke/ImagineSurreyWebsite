import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { unfollowPromise } from "@/lib/server/newsletter";

// The "stop following this promise" link in a promise-status email: removes
// the follow for that token and shows a plain confirmation.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  let removed = false;
  try {
    removed = token ? await unfollowPromise(getDb(), token) : false;
  } catch (err) {
    console.error("unfollow failed", err);
  }
  return NextResponse.redirect(new URL(removed ? "/newsletter/unfollowed" : "/newsletter/unfollowed?missing=1", req.url), 303);
}
