// Starbase ("the desk") and the human check, end to end: what the website
// forwards to the fake Starbase in fake-stripe.mjs (and what it never does),
// retries, refusals and a wrong key through the admin, the treasurer's list
// of gifts to log at the desk, and the human check enforced by a second
// server started with the Turnstile keys.
//   ADMIN_EMAIL=admin@example.com npm run e2e -- desk
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { adminCookie, adminLogin, BASE, fakeSession, finish, ok, post, sessionIdFromUrl as sid, sql, STRIPE_BASE, stripeEvent } from "./helpers.mjs";

const KEY = process.env.STARBASE_KEY ?? "sbk_e2eTestKey0123456789abcdefABCDEF";
const ALLOWED = new Set(["name", "first_name", "last_name", "email", "phone", "address", "unit", "city", "postal", "tags", "newsletter", "volunteer", "note", "source"]);

const starbase = async () => (await fetch(`${STRIPE_BASE}/__starbase`)).json();
const control = (what, body = {}) => fetch(`${STRIPE_BASE}/__starbase/${what}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll until fn returns something truthy (or time runs out, returning the last value). */
async function until(fn, ms = 15_000) {
  const stop = Date.now() + ms;
  let v;
  while (Date.now() < stop) {
    v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return v;
}
const rowsFor = (email) => sql`select * from starbase_outbox where payload->>'email' = ${email} order by created_at`;
const requestsFor = async (email) => (await starbase()).filter((r) => r.path === "/in/v1/people" && r.body?.email === email);
const sentRow = (email) => until(async () => (await rowsFor(email)).find((r) => r.status === "sent"));
const onlyAllowed = (body) => Object.keys(body ?? {}).every((k) => ALLOWED.has(k));

// ── Before: what the other suites forwarded ───────────────────────────────
const leftover = await until(async () => Number((await sql`select count(*)::int as n from starbase_outbox where status = 'pending'`)[0].n) === 0, 10_000);
ok(leftover === true, "nothing the earlier suites forwarded is left waiting (every sign-up reached the fake Starbase)");
await control("reset");

// ── A petition signature ──────────────────────────────────────────────────
const [petition] = await sql`select slug, title from campaigns where kind = 'petition' and active order by sort_order limit 1`;
let r = await post("/api/signatures", {
  campaign: petition.slug,
  firstName: "Desk",
  lastName: "Signer",
  email: "desk-signer@example.com",
  postalCode: "v3t1v8",
  phone: "604-555-0142",
  address: "13450 104 Ave",
  updatesConsent: true,
});
ok(r.status === 200, "a petition signature is accepted");
let row = await sentRow("desk-signer@example.com");
let req = row && (await starbase()).find((x) => x.idempotencyKey === row.id);
ok(Boolean(row && req), "the signature reaches Starbase, and the outbox row is sent");
ok(req?.authorization === `Bearer ${KEY}` && /^application\/json/.test(req?.contentType ?? ""), "sent from the server with the Bearer website key, as JSON");
ok(req?.idempotencyKey === row?.id, "the Idempotency-Key is the outbox row id");
ok(
  JSON.stringify(req?.body) ===
    JSON.stringify({
      address: "13450 104 Ave",
      email: "desk-signer@example.com",
      first_name: "Desk",
      last_name: "Signer",
      newsletter: true,
      phone: "604-555-0142",
      postal: "V3T 1V8",
      source: `petition-${petition.slug}`,
      tags: [`Petition: ${petition.title}`.slice(0, 40).trim()],
    }),
  "the person's fields, the petition tag, the source and newsletter (consent recorded) are what Starbase got",
);
const [signer] = await sql`select starbase_person_id from people where email = 'desk-signer@example.com'`;
ok(Boolean(row?.starbase_person_id) && signer?.starbase_person_id === row.starbase_person_id && req?.answer?.person_id === row.starbase_person_id, "Starbase's person id is kept on the outbox row and on the supporter");

r = await post("/api/signatures", { campaign: petition.slug, firstName: "Quiet", lastName: "Signer", email: "desk-quiet@example.com", postalCode: "V3W 2A1" });
row = await sentRow("desk-quiet@example.com");
req = row && (await starbase()).find((x) => x.idempotencyKey === row.id);
ok(r.status === 200 && req && req.body.newsletter === undefined && onlyAllowed(req.body), "without the email tick, newsletter is not sent");

// ── Newsletter, single opt-in (email isn't configured here) ───────────────
r = await post("/api/newsletter", { email: "Desk-News@Example.com", source: "home" });
row = await sentRow("desk-news@example.com");
req = row && (await starbase()).find((x) => x.idempotencyKey === row.id);
ok(r.body?.status === "subscribed" && row?.kind === "newsletter", "a newsletter sign-up is forwarded once it is subscribed");
ok(JSON.stringify(req?.body) === JSON.stringify({ email: "desk-news@example.com", newsletter: true, source: "newsletter-home" }), "with newsletter: true and the sign-up's source");
r = await post("/api/newsletter", { email: "desk-news@example.com", source: "home" });
await sleep(800);
ok((await rowsFor("desk-news@example.com")).length === 1, "signing up again while subscribed forwards nothing more");

// ── A volunteer shift ─────────────────────────────────────────────────────
const date = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const [opening] = await sql`insert into shift_openings (date, slot, title, location, capacity, published) values (${date}, 'morning', 'Desk test canvass', 'Newton Library', 5, true) returning id`;
r = await post("/api/volunteer/signup", { openingId: opening.id, name: "Vol Desk", email: "desk-vol@example.com", postalCode: "V3W 2A1", phone: "604-555-0143" });
row = await sentRow("desk-vol@example.com");
req = row && (await starbase()).find((x) => x.idempotencyKey === row.id);
const longDate = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
ok(r.status === 200 && row?.kind === "volunteer-shift", "a shift sign-up is forwarded");
ok(
  req?.body?.volunteer === true && req.body.note === `Signed up for Desk test canvass, ${longDate}, 9 a.m.–12 p.m. at Newton Library` && req.body.source === "volunteer-shift" && req.body.newsletter === undefined && req.body.name === "Vol Desk",
  "with volunteer: true and the shift in the note (no newsletter without the tick)",
);

// ── What is never sent: an RSVP, a donation, an order ─────────────────────
const outboxCount = async () => (await sql`select count(*)::int as n from starbase_outbox`)[0].n;
const countBefore = await outboxCount();
const [event] = await sql`insert into events (slug, title, starts_at, location, summary, published) values ('desk-e2e-meetup', 'Desk meetup', now() + interval '10 days', 'Hall', 'A meetup', true) returning id`;
r = await post("/api/events/desk-e2e-meetup/rsvp", { name: "Rae Rsvp", email: "desk-rsvp@example.com", guests: 1, newsletter: true });
ok(r.status === 200, "an RSVP is accepted");
const donor = { firstName: "Desk", lastName: "Donor", email: "desk-donor@example.com", address: "10 King George Blvd", city: "Surrey", postalCode: "V3T 2W1", attestCitizenOrPR: true, attestBcResident: true, attestOwnFunds: true, newsletter: true };
r = await post("/api/donations/checkout", { ...donor, frequency: "one_time", tier: "standard", amountCents: 5000 });
ok(r.status === 200 && r.body?.url, "a donation checkout starts");
const donationSession = sid(r.body.url);
const [product] = await sql`select slug from products where active order by sort_order limit 1`;
r = await post("/api/shop/checkout", { items: [{ slug: product.slug, quantity: 1 }] });
ok(r.status === 200, "a shop checkout starts");
// The donation is paid (the Stripe webhook), which must not forward it either.
const s = await fakeSession(donationSession);
let w = await stripeEvent("checkout.session.completed", { id: donationSession, object: "checkout.session", mode: s.mode, metadata: s.metadata, payment_status: "paid", payment_intent: `pi_${donationSession}`, customer: "cus_desk", amount_total: s.amount_total });
ok(w.status === 200, "the donation is paid");
await sleep(1500);
ok((await rowsFor("desk-rsvp@example.com")).length === 0 && (await requestsFor("desk-rsvp@example.com")).length === 0, "an RSVP sends nothing to Starbase");
ok((await rowsFor("desk-donor@example.com")).length === 0 && (await requestsFor("desk-donor@example.com")).length === 0, "a donation (checkout and payment) sends nothing to Starbase");
ok((await outboxCount()) === countBefore, "and neither does the shop checkout: nothing was queued at all");
ok((await starbase()).every((x) => !x.raw || !/amount|cents|fee|stripe|pi_|cs_test/i.test(x.raw)), "no request to Starbase has ever carried money or a payment reference");

// ── A membership, once paid ───────────────────────────────────────────────
const member = { firstName: "Mem", lastName: "Desk", email: "desk-member@example.com", phone: "604-555-0144", address: "20 Fraser Hwy", city: "Surrey", postalCode: "V3S 1A1", neighbourhood: "Cloverdale", birthdate: "1985-01-02", citizenshipStatus: "Citizen", gender: "", languages: ["English"], student: false, campus: "", issue: "Safer streets", interestVolunteer: true, interestLawnSign: true, updatesConsent: true, consent: true, website: "" };
r = await post("/api/membership", member);
ok(r.status === 200 && r.body?.status === "checkout", "a membership goes to checkout");
await sleep(500);
ok((await rowsFor("desk-member@example.com")).length === 0, "nothing is forwarded before the membership is paid");
const ms = await fakeSession(sid(r.body.url));
w = await stripeEvent("checkout.session.completed", { id: ms.id, object: "checkout.session", mode: ms.mode, metadata: ms.metadata, payment_status: "paid", payment_intent: `pi_${ms.id}`, customer: "cus_member", amount_total: ms.amount_total });
row = await sentRow("desk-member@example.com");
req = row && (await starbase()).find((x) => x.idempotencyKey === row.id);
ok(w.status === 200 && row?.kind === "membership", "an active membership is forwarded after the webhook");
ok(
  JSON.stringify(req?.body) ===
    JSON.stringify({
      address: "20 Fraser Hwy",
      city: "Surrey",
      email: "desk-member@example.com",
      name: "Mem Desk",
      newsletter: true,
      note: "Wants to volunteer. Asked for a lawn sign",
      phone: "604-555-0144",
      postal: "V3S 1A1",
      source: "membership",
      tags: ["Member (joined online)"],
      volunteer: true,
    }),
  "from the member snapshot: volunteering, the lawn sign in the note, the updates tick, and no fee",
);

// ── Browser: the admin ────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await adminLogin(page);

// Starbase down (503): the row waits with a backoff; "Send now" delivers it with the same key.
await control("fail", { status: 503, times: 1 });
r = await post("/api/signatures", { campaign: petition.slug, firstName: "Retry", lastName: "Later", email: "desk-retry@example.com", postalCode: "V3T 1V8" });
row = await until(async () => (await rowsFor("desk-retry@example.com")).find((x) => x.attempts === 1));
ok(r.status === 200, "the visitor's signature succeeds while Starbase is down");
ok(row?.status === "pending" && row.next_attempt_at && new Date(row.next_attempt_at) > new Date() && /^503/.test(row.last_error ?? ""), "a 503 leaves the row pending, with a next attempt time and the error");
await page.goto(BASE + "/admin/integrations");
await page.getByRole("button", { name: /^Send now/ }).click();
await page.locator("[role=status]", { hasText: "sent" }).first().waitFor({ timeout: 20_000 });
const retried = await sentRow("desk-retry@example.com");
const both = await requestsFor("desk-retry@example.com");
ok(retried && both.length === 2 && both[0].status === 503 && both[1].status === 200 && both[0].idempotencyKey === retried.id && both[1].idempotencyKey === retried.id && both[0].raw === both[1].raw, "\"Send now\" delivers it with the same Idempotency-Key and body");

// Starbase refuses (400): failed with the message; Retry in the outbox page sends it again.
await control("fail", { status: 400, times: 1 });
r = await post("/api/signatures", { campaign: petition.slug, firstName: "Refused", lastName: "Once", email: "desk-refused@example.com", postalCode: "V3T 1V8" });
row = await until(async () => (await rowsFor("desk-refused@example.com")).find((x) => x.status === "failed"));
ok(row?.last_error === "400: simulated 400" && row.attempts === 1, "a 400 marks the row failed, with Starbase's message");
const dash = await (await fetch(BASE + "/admin", { headers: { cookie: await adminCookie() } })).text();
ok(dash.replace(/<!--.*?-->/g, "").includes("sign-ups Starbase refused"), "the dashboard flags sign-ups Starbase refused");
await page.goto(BASE + "/admin/integrations/starbase?status=failed");
const failedRow = page.locator(`tr[data-outbox="${row?.id}"]`);
ok((await failedRow.count()) === 1 && (await failedRow.textContent()).includes("400: simulated 400"), "the outbox page lists the failed row with its error");
await failedRow.getByRole("button", { name: "Retry" }).click();
// Once sent it leaves this "failed" list.
row = await until(async () => (await rowsFor("desk-refused@example.com")).find((x) => x.status === "sent"), 20_000);
await page.waitForFunction((id) => !document.querySelector(`tr[data-outbox="${id}"]`), row?.id, { timeout: 15_000 }).catch(() => {});
row = (await rowsFor("desk-refused@example.com"))[0];
ok(row.status === "sent" && (await requestsFor("desk-refused@example.com")).length === 2, "Retry sends it again, and it goes");
const audited = await sql`select action from audit_log where action in ('integrations.starbase-retry', 'integrations.starbase-send')`;
ok(audited.length >= 2, "Send now and Retry are in the audit log");

// A wrong key (401): rows stay pending without burning attempts, and the card says so.
await control("key", { key: "sbk_revokedKey0123456789abcdefghijkl" });
r = await post("/api/signatures", { campaign: petition.slug, firstName: "Wrong", lastName: "Key", email: "desk-key@example.com", postalCode: "V3T 1V8" });
row = await until(async () => (await rowsFor("desk-key@example.com")).find((x) => x.last_error));
ok(r.status === 200 && row?.status === "pending" && row.attempts === 0 && /^401/.test(row.last_error), "a 401 leaves the row pending with no attempt counted");
await page.goto(BASE + "/admin/integrations");
const card = page.locator("section[aria-label='Starbase (the desk)']");
const cardText = await card.textContent();
ok(cardText.includes("401") && cardText.includes("Check the key") && cardText.includes("problem"), "the integrations card shows the key problem");
await card.getByRole("button", { name: "Test connection" }).click();
await card.locator("[role=alert]").first().waitFor({ timeout: 15_000 });
ok((await card.locator("[role=alert]").first().textContent()).includes("401"), "Test connection reports the refused key");
await control("key", { key: KEY });
await card.getByRole("button", { name: "Test connection" }).click();
await card.locator("[role=status]", { hasText: "Connected to Imagine Surrey (test)" }).first().waitFor({ timeout: 15_000 });
ok(true, "Test connection names the campaign and the key once the key works");
await card.getByRole("button", { name: /^Send now/ }).click();
await card.locator("[role=status]", { hasText: "sent" }).first().waitFor({ timeout: 20_000 });
ok((await rowsFor("desk-key@example.com"))[0].status === "sent", "with the key fixed, Send now delivers what was waiting");

// The supporter's profile shows the Starbase id and what was sent.
const [keyPerson] = await sql`select id, starbase_person_id from people where email = 'desk-key@example.com'`;
await page.goto(`${BASE}/admin/people/${keyPerson.id}`);
const profile = await page.locator("main, body").first().textContent();
ok(Boolean(keyPerson.starbase_person_id) && profile.includes(keyPerson.starbase_person_id) && profile.includes("Sent to Starbase"), "the profile shows the Starbase id and the person's outbox rows");

// ── Gifts to log at the desk ──────────────────────────────────────────────
const [gift] = await sql`select id, desk_logged_at from contributions where stripe_checkout_session_id = ${donationSession}`;
const cookie = await adminCookie();
const dashboard = (await (await fetch(BASE + "/admin", { headers: { cookie } })).text()).replace(/<!--.*?-->/g, "");
ok(dashboard.includes("online gifts to log at the desk"), "the dashboard counts online gifts to log at the desk");
let csv = await (await fetch(BASE + "/api/admin/desk-gifts", { headers: { cookie } })).text();
const header = "Contributor name,Address,City,Postal code,Email,Amount,Net of refunds,Slate,Kind,Paid (Pacific),Stripe reference,Flags,Website id";
ok(csv.split("\r\n")[0] === header, "the CSV has the expected header");
const csvLine = csv.split("\r\n").find((l) => l.includes(gift.id)) ?? "";
ok(csvLine.startsWith("Desk Donor,10 King George Blvd,Surrey,V3T 2W1,desk-donor@example.com,50.00,50.00,City council,Donation,") && csvLine.includes(`pi_${donationSession}`), "the CSV row has what Log a gift asks for");
await page.goto(BASE + "/admin/desk-gifts");
const giftRow = page.locator(`tr[data-gift="${gift.id}"]`);
ok((await giftRow.count()) === 1 && (await giftRow.textContent()).includes("Desk Donor") && (await giftRow.textContent()).includes("$50"), "the paid donation is listed to log at the desk");
await giftRow.getByRole("button", { name: /Mark logged/ }).click();
await page.locator("[role=status]", { hasText: "Marked 1 gift" }).first().waitFor({ timeout: 15_000 });
await page.waitForFunction((id) => !document.querySelector(`tr[data-gift="${id}"]`), gift.id, { timeout: 15_000 });
const [logged] = await sql`select c.desk_logged_at, a.email from contributions c left join admin_users a on a.id = c.desk_logged_by where c.id = ${gift.id}`;
ok(logged.desk_logged_at && logged.email === (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase(), "Mark logged records when and by whom, and the row leaves the list");
csv = await (await fetch(BASE + "/api/admin/desk-gifts", { headers: { cookie } })).text();
ok(!csv.includes(gift.id), "a logged gift leaves the CSV too");
await browser.close();

// ── The human check, enforced (a second server with the Turnstile keys) ───
const root = path.resolve(import.meta.dirname, "..");
const humanPort = Number(process.env.E2E_HUMAN_PORT ?? Number(process.env.E2E_PORT ?? 3100) + 1);
const HUMAN = `http://localhost:${humanPort}`;
const server = spawn("npx", ["next", "start", "-p", String(humanPort)], {
  cwd: root,
  env: { ...process.env, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x-e2e-site-key", TURNSTILE_SECRET_KEY: "e2e-turnstile-secret", TURNSTILE_VERIFY_URL: `${STRIPE_BASE}/turnstile/siteverify`, NEXT_PUBLIC_SITE_URL: HUMAN },
  stdio: ["ignore", "ignore", "inherit"],
  detached: true,
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stopServer);
const up = await until(async () => {
  try {
    return (await fetch(HUMAN + "/api/stats")).status < 500;
  } catch {
    return false;
  }
}, 60_000);
ok(up === true, "a second server starts with the human check on");
const sign = async (headers) => {
  const res = await fetch(HUMAN + "/api/signatures", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers },
    body: JSON.stringify({ campaign: petition.slug, firstName: "Human", lastName: "Check", email: "desk-human@example.com", postalCode: "V3T 1V8" }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
let h = await sign({});
ok(h.status === 400 && h.body?.error === "Please complete the check that you're a person, then try again." && Boolean(h.body?.fields?.human), "without a token: 400, with a human field error");
h = await sign({ "x-human-token": "bad-token" });
ok(h.status === 400 && Boolean(h.body?.fields?.human), "with a bad token: 400");
ok((await sql`select count(*)::int as n from campaign_signatures where email = 'desk-human@example.com'`)[0].n === 0, "nothing was signed without a good token");
h = await sign({ "x-human-token": "ok-token" });
ok(h.status === 200 && h.body?.ok === true, "with a good token: 200");
const verifyCalls = (await (await fetch(`${STRIPE_BASE}/__log`)).json()).filter((c) => c.path === "/turnstile/siteverify");
ok(verifyCalls.some((c) => c.params.response === "ok-token" && /^10\.88\./.test(c.params.remoteip ?? "")), "the server checked the token with the visitor's IP");
const bot = await fetch(HUMAN + "/api/newsletter", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.89.1.1" }, body: JSON.stringify({ email: "bot@example.com", website: "spam.example" }) });
ok(bot.status === 200 && (await bot.json()).ok === true, "the honeypot still answers a bot with a fake success first");
const donate = await fetch(HUMAN + "/api/donations/checkout", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.89.1.2" }, body: JSON.stringify({ ...donor, email: "desk-human-donor@example.com", frequency: "one_time", tier: "standard", amountCents: 1000 }) });
ok(donate.status === 200, "the donation checkout doesn't ask for the human check (Stripe screens payments)");
stopServer();

await finish();
