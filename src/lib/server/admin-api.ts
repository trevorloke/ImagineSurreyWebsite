import "server-only";
import { error } from "./api";
import { isAdmin } from "./admin-auth";

/** For admin API routes: a 401 response when not signed in, otherwise null. */
export async function adminOnly() {
  return (await isAdmin()) ? null : error("Not signed in.", 401);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Postgres unique-constraint violation, whether or not the ORM wrapped the error. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
