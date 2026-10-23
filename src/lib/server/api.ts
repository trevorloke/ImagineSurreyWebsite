import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { fieldErrors } from "@/lib/validation";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ error: message, fields }, { status });
}

// A small fixed-window limiter per client IP. It is per server instance, which
// is enough to blunt form spam; put a WAF rule in front for anything stronger.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(req: NextRequest, bucket: string, limit = 10, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Rate-limit, read the JSON body and validate it. Honeypot hits get a fake success. */
export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S, bucket: string): Promise<Parsed<z.output<S>>> {
  if (rateLimited(req, bucket)) return { ok: false, response: error("Too many requests. Please wait a minute and try again.", 429) };
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: error("Expected a JSON body.") };
  }
  if (body && typeof body === "object" && "website" in body && (body as { website?: unknown }).website) {
    return { ok: false, response: json({ ok: true }) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { ok: false, response: error("Please check the highlighted fields.", 422, fieldErrors(result.error)) };
  }
  return { ok: true, data: result.data };
}
