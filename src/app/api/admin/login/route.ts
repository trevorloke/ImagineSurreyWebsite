import { NextResponse, type NextRequest } from "next/server";
import { rateLimited } from "@/lib/server/api";
import { ADMIN_COOKIE, newSessionToken, passwordMatches } from "@/lib/server/admin-auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const back = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  if (rateLimited(req, "admin-login", 5, 15 * 60_000)) return back("/admin/login?error=locked");
  if (!passwordMatches(String(form.get("password") ?? ""))) return back("/admin/login?error=1");

  const res = back("/admin");
  const { value, maxAge } = newSessionToken();
  res.cookies.set(ADMIN_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
  return res;
}
