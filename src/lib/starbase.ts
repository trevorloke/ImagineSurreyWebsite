import "server-only";
import { env } from "@/lib/env";

// Starbase is the site's backend: it holds every person, member, gift,
// subscriber, signature, RSVP and order, and the content the site shows.
// The site reads Starbase's public JSON (no sign-in; drafts never come
// through) and posts its forms there. Starbase's own pages (donate,
// volunteer, unsubscribe, the Stripe webhook) stay on Starbase.
//
//   read(path)         GET  /api/public/<workspace><path>  → the JSON, or null on 404
//   write(path, body)  POST /api/public/<workspace><path>  → { status, data }
//   publicUrl(path)    a link on Starbase (/u/…, /v/…)

export const publicUrl = (path = "") => `${env.starbaseUrl}${path}`;
const api = () => `${env.starbaseUrl}/api/public/${env.starbaseWorkspace}`;

export async function read<T>(path: string): Promise<T | null> {
  const res = await fetch(`${api()}${path}`, { cache: "no-store", headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Starbase answered ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** A read that must never take a page down: Starbase unreachable → null, logged. */
export async function readOrNull<T>(path: string): Promise<T | null> {
  try {
    return await read<T>(path);
  } catch (err) {
    console.error(err);
    return null;
  }
}

export type Reply<T> = { status: number; data: T & { error?: string; field?: string } };

export async function write<T = Record<string, unknown>>(path: string, body: unknown): Promise<Reply<T>> {
  const res = await fetch(`${api()}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; field?: string };
  return { status: res.status, data };
}

/** Where Stripe brings people back to: the site's own pages. */
export const returnTo = (success: string, cancel: string) => ({ success: `${env.siteUrl}${success}`, cancel: `${env.siteUrl}${cancel}` });
