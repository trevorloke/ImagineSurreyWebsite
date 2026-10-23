import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export const ADMIN_COOKIE = "is_admin";
const SESSION_HOURS = 12;

function sign(value: string): string {
  return createHmac("sha256", env.adminSessionSecret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function passwordMatches(candidate: string): boolean {
  // Compare digests so the comparison is constant-time whatever the lengths.
  return safeEqual(sign(`pw:${candidate}`), sign(`pw:${env.adminPassword}`));
}

export function newSessionToken(): { value: string; maxAge: number } {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  return { value: `${expires}.${sign(String(expires))}`, maxAge: SESSION_HOURS * 3600 };
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return safeEqual(mac, sign(expires));
}

export async function isAdmin(): Promise<boolean> {
  return isValidSession((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
