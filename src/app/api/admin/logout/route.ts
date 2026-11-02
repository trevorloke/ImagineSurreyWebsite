import { NextResponse, type NextRequest } from "next/server";
import { parseSessionCookie, revokeSession, SESSION_COOKIE } from "@/lib/server/admin-auth";

export async function POST(req: NextRequest) {
  const parsed = parseSessionCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (parsed) await revokeSession(parsed.id);
  const res = NextResponse.redirect(new URL("/admin/login?signedout=1", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
