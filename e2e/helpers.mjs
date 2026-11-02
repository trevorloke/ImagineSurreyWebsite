// Shared helpers for the end-to-end suites. Each suite is a plain script that
// prints PASS/FAIL lines and exits non-zero on any failure.
import postgres from "postgres";

export const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`;
export const STRIPE_BASE = process.env.STRIPE_API_BASE ?? `http://localhost:${process.env.E2E_STRIPE_PORT ?? 12111}`;
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_localtestsecret";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "local-admin-pw";

export const sql = postgres(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/imagine_surrey_e2e", { max: 2 });

let failures = 0;
export function ok(cond, message) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${message}`);
  if (!cond) failures += 1;
}

export async function finish() {
  await sql.end();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

/** POST JSON to the site from a fresh random IP, so the rate limiter never trips. */
export async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.${rand(250)}.${rand(250)}.${rand(250)}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const rand = (n) => 1 + Math.floor(Math.random() * n);

export async function fakeSession(id) {
  return (await fetch(`${STRIPE_BASE}/v1/checkout/sessions/${id}`)).json();
}

export async function stripeLog() {
  return (await fetch(`${STRIPE_BASE}/__log`)).json();
}

export const sessionIdFromUrl = (url) => url.split("/").pop();

/** Sign in to /admin with Playwright (the bootstrap owner from ADMIN_EMAIL/ADMIN_PASSWORD). */
export async function adminLogin(page) {
  await page.goto(BASE + "/admin/login");
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.locator('form[action="/api/admin/login"] button[type=submit]').click();
  await page.waitForURL(/\/admin(?!\/login)/);
}

/** Sign in over HTTP and return the Cookie header value for fetch calls. */
export async function adminCookie() {
  const res = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }), redirect: "manual" });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`admin sign-in failed (${res.status})`);
  return cookie;
}
