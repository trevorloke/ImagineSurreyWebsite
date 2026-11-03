import { and, eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { adminMagicLinkEmail } from "@/lib/email/messages";
import { ensureBootstrapOwner, isLocked, loginByEmail, recordAttempt, requestMeta, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/admin-auth";
import { audit } from "@/lib/server/audit";
import { sendEmail } from "@/lib/server/email";
import { getSettings } from "@/lib/server/settings";
import { consumeToken, createToken, tokenUrl } from "@/lib/server/tokens";
import { safeNext } from "@/lib/server/admin-redirect";

const LINK_MINUTES = 20;

/**
 * Ask for a sign-in link. The response is the same whether or not the address
 * has an account, and the lookup and email happen after it is sent, so
 * neither timing nor a mail failure shows who is staff.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));
  const meta = requestMeta(req);
  const back = (query: string) => NextResponse.redirect(new URL(`/admin/login?${query}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, req.url), 303);
  if (!env.emailEnabled) return back("error=email-not-configured");
  const db = getDb();
  await ensureBootstrapOwner(db);
  const key = `link:${meta.ip ?? "unknown"}`;
  if (await isLocked(db, key)) return back("error=locked");
  await recordAttempt(db, key, false);

  after(async () => {
    try {
      const user = await db.query.adminUsers.findFirst({ where: and(eq(adminUsers.email, email), eq(adminUsers.active, true)) });
      if (!user) return;
      const raw = await createToken(db, "admin-login", email, { ttlMinutes: LINK_MINUTES, data: { next } });
      const { org } = await getSettings();
      const message = adminMagicLinkEmail({ siteUrl: env.siteUrl, orgName: org.name, orgEmail: org.email }, tokenUrl("/api/admin/magic-link", raw), LINK_MINUTES);
      await sendEmail(db, { to: email, kind: "admin-magic-link", ...message });
    } catch (err) {
      console.error("admin sign-in link failed", err);
    }
  });
  return back("sent=1");
}

/** The link in the email. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const db = getDb();
  const token = await consumeToken(db, "admin-login", raw);
  if (!token) return NextResponse.redirect(new URL("/admin/login?error=link", req.url), 303);
  const result = await loginByEmail(token.email, requestMeta(req));
  if (!result.ok) return NextResponse.redirect(new URL("/admin/login?error=invalid", req.url), 303);
  const res = NextResponse.redirect(new URL(safeNext(token.data?.next), req.url), 303);
  res.cookies.set(SESSION_COOKIE, result.cookie.value, { ...sessionCookieOptions, maxAge: result.cookie.maxAge });
  await audit(result.user, "signin", { method: "email-link" });
  return res;
}
