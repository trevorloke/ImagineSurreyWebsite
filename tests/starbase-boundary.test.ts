// What never goes to Starbase ("the desk"): donations, monthly gifts, shop
// orders, event RSVPs, promise-tracker follows, preference changes and
// anything done in /admin. Gifts are logged at the desk by the treasurer,
// where the contribution limits are checked. This test reads the import graph
// of each of those code paths and fails if one of them can reach the outbox.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const src = (p: string) => path.join(root, "src", p);
const rel = (p: string) => path.relative(root, p);

const STARBASE = src("lib/server/starbase.ts");
const OUTBOX = src("lib/server/starbase-outbox.ts");
const FORWARD = src("lib/server/starbase-forward.ts");

type Edge = { target: string; names: string[] | "*" };

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = src(spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The value imports (and re-exports) of a file; `import type` doesn't count. */
function edges(file: string): Edge[] {
  const code = readFileSync(file, "utf8");
  const out: Edge[] = [];
  const add = (spec: string, names: string[] | "*") => {
    const target = resolve(file, spec);
    if (target) out.push({ target, names });
  };
  for (const m of code.matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    if (m[2]) continue;
    const clause = m[3];
    const braces = /\{([\s\S]*)\}/.exec(clause);
    const names = braces
      ? braces[1]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type "))
          .map((s) => s.split(/\s+as\s+/)[0])
      : "*";
    if (Array.isArray(names) && names.length === 0 && !/^\s*\w/.test(clause.replace(/\{[\s\S]*\}/, ""))) continue;
    add(m[4], clause.includes("*") || !braces || /^\s*\w+\s*,/.test(clause) ? "*" : names);
  }
  for (const m of code.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) add(m[1], []);
  for (const m of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) add(m[1], "*");
  return out;
}

type Allowance = (from: string, edge: Edge) => boolean;

/** The path from `entry` to a Starbase module that `allowed` doesn't excuse, or null. */
function reachesStarbase(entry: string, allowed: Allowance): string[] | null {
  const seen = new Set<string>();
  const stack: string[][] = [[entry]];
  while (stack.length) {
    const trail = stack.pop()!;
    const file = trail[trail.length - 1];
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of edges(file)) {
      if (edge.target === STARBASE || edge.target === OUTBOX || edge.target === FORWARD) {
        if (allowed(file, edge)) continue;
        return [...trail, edge.target].map(rel);
      }
      if (!seen.has(edge.target)) stack.push([...trail, edge.target]);
    }
  }
  return null;
}

const only = (names: string[] | "*", allowedNames: string[]) => names !== "*" && names.every((n) => allowedNames.includes(n));

// Payments and the Stripe webhook handle donations, monthly gifts and orders
// too; the one thing they may forward is a membership that became active.
const membershipOnly: Allowance = (from, edge) =>
  edge.target === FORWARD && [src("lib/server/payments.ts"), src("lib/server/webhooks.ts")].includes(from) && only(edge.names, ["forwardMembership"]);

const NEVER_FORWARDED = [
  "app/api/donations/checkout/route.ts",
  "app/api/shop/checkout/route.ts",
  "app/api/stripe/webhook/route.ts",
  "app/api/me/billing-portal/route.ts",
  "app/api/events/[slug]/rsvp/route.ts",
  "app/api/tracker/follow/route.ts",
  "app/api/tracker/follow/confirm/route.ts",
  "app/api/preferences/route.ts",
  "app/api/preferences/request/route.ts",
  "app/api/newsletter/unsubscribe/route.ts",
  "app/api/newsletter/unfollow/route.ts",
  "app/me/(portal)/preferences/actions.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("what is never forwarded to Starbase", () => {
  it.each(NEVER_FORWARDED)("%s cannot reach the outbox", (file) => {
    const entry = src(file);
    expect(existsSync(entry), `${file} exists`).toBe(true);
    expect(reachesStarbase(entry, membershipOnly)).toBeNull();
  });

  it("nothing in the admin forwards a person; it may only read, deliver, retry or skip", () => {
    // The outbox's own admin functions; never enqueueStarbase, never a forward*.
    const ADMIN_OUTBOX = ["deliverOutbox", "retryOutboxRow", "skipOutboxRow", "outboxStats", "listOutbox", "outboxForPerson", "parseOutboxFilters", "OUTBOX_KINDS", "OUTBOX_STATUSES", "OUTBOX_PAGE_SIZE"];
    const ADMIN_CLIENT = ["ping", "starbaseUrlProblem"];
    const adminAllowed: Allowance = (from, edge) =>
      membershipOnly(from, edge) || (edge.target === OUTBOX && only(edge.names, ADMIN_OUTBOX)) || (edge.target === STARBASE && only(edge.names, ADMIN_CLIENT));
    const files = [...walk(src("app/admin")), ...walk(src("app/api/admin")), ...walk(src("components/admin"))];
    expect(files.length).toBeGreaterThan(20);
    const leaks = files.map((f) => reachesStarbase(f, adminAllowed)).filter(Boolean);
    expect(leaks).toEqual([]);
  });

  it("the import check sees a real forward (so the test above can fail)", () => {
    expect(reachesStarbase(src("app/api/signatures/route.ts"), membershipOnly)).toEqual(["src/app/api/signatures/route.ts", "src/lib/server/starbase-forward.ts"]);
    expect(reachesStarbase(src("app/api/volunteer/signup/route.ts"), membershipOnly)).not.toBeNull();
    // The webhook may forward memberships, but not with anything else.
    const strict: Allowance = (from, edge) => edge.target === FORWARD && from === src("lib/server/webhooks.ts") && only(edge.names, []);
    expect(reachesStarbase(src("app/api/stripe/webhook/route.ts"), strict)).not.toBeNull();
  });
});
