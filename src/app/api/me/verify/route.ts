import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { safeMemberNext } from "@/lib/engagement";
import { setMemberSession } from "@/lib/server/member-auth";
import { findPersonByEmail } from "@/lib/server/people";
import { consumeToken } from "@/lib/server/tokens";

/** The link in the sign-in email: redeem the token once, start the session, carry on to `next`. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const expired = () => NextResponse.redirect(new URL("/me/login?error=expired", req.url), 303);
  const db = getDb();
  const token = await consumeToken(db, "member-login", raw);
  if (!token) return expired();
  const person = await findPersonByEmail(db, token.email);
  if (!person) return expired();
  await setMemberSession(person.id);
  const next = safeMemberNext(req.nextUrl.searchParams.get("next") ?? token.data?.next);
  return NextResponse.redirect(new URL(next, req.url), 303);
}
