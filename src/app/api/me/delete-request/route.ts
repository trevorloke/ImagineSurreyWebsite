import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getMember } from "@/lib/server/member-auth";
import { requestDeletion } from "@/lib/server/portal";

/** "Ask us to delete my account": tags the record, notes it, and emails the office. */
export async function POST(req: NextRequest) {
  const person = await getMember();
  if (!person) return NextResponse.redirect(new URL("/me/login?next=%2Fme%2Fdata", req.url), 303);
  try {
    await requestDeletion(getDb(), person);
    return NextResponse.redirect(new URL("/me/data?requested=1", req.url), 303);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(new URL("/me/data?requested=failed", req.url), 303);
  }
}
