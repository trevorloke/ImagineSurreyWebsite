import type { NextRequest } from "next/server";
import { redirectTo } from "@/lib/redirect";
import { loginWithPassword, requestMeta, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/admin-auth";
import { safeNext } from "@/lib/server/admin-redirect";
import { audit } from "@/lib/server/audit";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const back = (query: string) => redirectTo(`/admin/login?${query}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, 303);

  if (!email || !password) return back("error=invalid");
  const result = await loginWithPassword(email, password, requestMeta(req));
  if (!result.ok) return back(`error=${result.reason}`);

  const res = redirectTo(next, 303);
  res.cookies.set(SESSION_COOKIE, result.cookie.value, { ...sessionCookieOptions, maxAge: result.cookie.maxAge });
  await audit(result.user, "signin", { method: "password" });
  return res;
}
