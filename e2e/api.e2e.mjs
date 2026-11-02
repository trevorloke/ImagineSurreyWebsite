// Every public form, every Stripe webhook path, and the admin API, against a
// real database and the fake Stripe server. Run with `npm run e2e` or
// `npm run e2e -- api`.
import Stripe from "stripe";
import { BASE, WEBHOOK_SECRET, ADMIN_PASSWORD, sql, ok, finish, post, fakeSession, stripeLog, sessionIdFromUrl as sid } from "./helpers.mjs";

const stripe = new Stripe("sk_test_x");
let evn = 0;

async function webhook(type, object) {
  const payload = JSON.stringify({ id: `evt_${Date.now()}_${++evn}`, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(BASE + "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  return { status: r.status, body: await r.json(), payload };
}

const completed = async (id, extra = {}) => {
  const s = await fakeSession(id);
  return webhook("checkout.session.completed", {
    id,
    object: "checkout.session",
    mode: s.mode,
    metadata: s.metadata,
    payment_status: "paid",
    payment_intent: `pi_${id}`,
    customer: "cus_123",
    amount_total: s.amount_total,
    ...extra,
  });
};

// ── Newsletter ────────────────────────────────────────────────────────────
let r = await post("/api/newsletter", { email: "News@Example.com", source: "home" });
ok(r.status === 200, "newsletter subscribe");
r = await post("/api/newsletter", { email: "news@example.com" });
ok(r.status === 200 && (await sql`select count(*)::int c from newsletter_subscribers where email='news@example.com'`)[0].c === 1, "newsletter re-subscribe is idempotent");
r = await post("/api/newsletter", { email: "bot@example.com", website: "spam.com" });
ok(r.status === 200 && (await sql`select count(*)::int c from newsletter_subscribers where email='bot@example.com'`)[0].c === 0, "honeypot submission dropped silently");
r = await post("/api/newsletter", { email: "not-an-email" });
ok(r.status === 422 && r.body.fields?.email, "invalid email rejected with field error");

// ── Membership ────────────────────────────────────────────────────────────
const member = {
  firstName: "Asha",
  lastName: "Singh",
  email: "asha@example.com",
  phone: "",
  address: "13450 104 Ave",
  city: "Surrey",
  postalCode: "v3t1v8",
  neighbourhood: "Whalley",
  birthdate: "1990-04-12",
  citizenshipStatus: "Citizen",
  gender: "",
  languages: ["English", "Punjabi"],
  student: false,
  campus: "",
  issue: "Safer streets",
  interestVolunteer: true,
  interestLawnSign: false,
  consent: true,
  website: "",
};
r = await post("/api/membership", { ...member, birthdate: "2015-01-01" });
ok(r.status === 422 && r.body.fields?.birthdate, "under-14 membership refused");
r = await post("/api/membership", { ...member, email: "visitor@example.com", citizenshipStatus: "Other" });
ok(r.status === 422 && r.body.fields?.citizenshipStatus, "non-citizen can't pay membership fee");
r = await post("/api/membership", member);
ok(r.status === 200 && r.body.status === "checkout", "membership creates Stripe checkout");
const memSession = sid(r.body.url);
const memParams = (await fakeSession(memSession)).params;
ok(memParams.line_items["0"].price_data.unit_amount === "1000" && memParams.customer_email === "asha@example.com", "membership checkout charges $10 to the member's email");
let w = await completed(memSession);
ok(w.status === 200 && w.body.result === "processed", "membership webhook processed");
let m = (await sql`select m.status, m.voting_eligible, m.expires_at > now() + interval '364 days' as year from memberships m join people p on p.id=m.person_id where p.email='asha@example.com'`)[0];
ok(m.status === "active" && m.voting_eligible && m.year, "membership active for a year, voting eligible");
let c = (await sql`select status, kind, amount_cents, contributor_postal_code from contributions where stripe_checkout_session_id=${memSession}`)[0];
ok(c.status === "succeeded" && c.kind === "membership_fee" && c.contributor_postal_code === "V3T 1V8", "membership fee recorded as a contribution");
const resend = await fetch(BASE + "/api/stripe/webhook", {
  method: "POST",
  headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: w.payload, secret: WEBHOOK_SECRET }) },
  body: w.payload,
});
ok((await resend.json()).result === "duplicate", "replayed webhook is ignored");
const bad = await fetch(BASE + "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef" }, body: w.payload });
ok(bad.status === 400, "webhook with bad signature rejected");
r = await post("/api/membership", member);
ok(r.body.status === "already_member", "existing member isn't charged twice");

// ── Donations ─────────────────────────────────────────────────────────────
const donor = {
  firstName: "Asha",
  lastName: "Singh",
  email: "asha@example.com",
  address: "13450 104 Ave",
  city: "Surrey",
  postalCode: "V3T 1V8",
  attestCitizenOrPR: true,
  attestBcResident: true,
  attestOwnFunds: true,
  newsletter: true,
};
r = await post("/api/donations/checkout", { ...donor, frequency: "one_time", tier: "standard", amountCents: 5000, postalCode: "M5V 2T6" });
ok(r.status === 422 && r.body.fields?.postalCode, "out-of-province donor refused");
r = await post("/api/donations/checkout", { ...donor, frequency: "one_time", tier: "standard", amountCents: 5000 });
ok(r.status === 200, "one-time donation checkout");
const donSession = sid(r.body.url);
w = await completed(donSession);
ok((await sql`select status from contributions where stripe_checkout_session_id=${donSession}`)[0].status === "succeeded", "donation recorded as succeeded");
r = await post("/api/donations/checkout", { ...donor, frequency: "one_time", tier: "star", amountCents: 0 });
ok(r.status === 422 && /\$1,369\.70/.test(r.body.error), `Star Club refused after $60 given, remaining shown: "${r.body.error}"`);
r = await post("/api/donations/checkout", { ...donor, email: "star@example.com", frequency: "one_time", tier: "superstar", amountCents: 0 });
const ss = await fakeSession(sid(r.body.url));
ok(r.status === 200 && Object.keys(ss.params.line_items).length === 2 && ss.amount_total === 285940, "Superstar one-time is two line items totalling $2,859.40");
const ssRows = await sql`select slate, amount_cents from contributions where stripe_checkout_session_id=${ss.id} order by slate`;
ok(ssRows.length === 2 && ssRows[0].slate === "council" && ssRows[1].slate === "school_board", "Superstar recorded per slate");
r = await post("/api/donations/checkout", { ...donor, email: "star@example.com", frequency: "one_time", tier: "standard", amountCents: 1000 });
ok(r.status === 422, "open Superstar checkout counts toward the limit");

// ── Monthly ───────────────────────────────────────────────────────────────
r = await post("/api/donations/checkout", { ...donor, email: "monthly@example.com", frequency: "monthly", tier: "superstar", amountCents: 0 });
const monSession = await fakeSession(sid(r.body.url));
ok(r.status === 200 && monSession.mode === "subscription" && monSession.params.subscription_data.metadata.recurringDonationId, "monthly gift creates a subscription checkout");
w = await completed(monSession.id, { subscription: "sub_1", payment_intent: null });
ok((await sql`select status, stripe_subscription_id from recurring_donations where stripe_checkout_session_id=${monSession.id}`)[0].stripe_subscription_id === "sub_1", "subscription activated");
const invoice = (id) => ({
  id,
  object: "invoice",
  status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: monSession.params.subscription_data.metadata } },
});
w = await webhook("invoice.paid", invoice("in_1"));
let inv = await sql`select slate, amount_cents, frequency, fund, stripe_payment_intent_id from contributions where stripe_invoice_id='in_1' order by slate`;
ok(inv.length === 2 && inv.every((x) => x.amount_cents === 11900 && x.fund === "imagine_victory_fund" && x.stripe_payment_intent_id === "pi_for_in_1"), "monthly Superstar payment recorded as two $119 contributions");
await webhook("invoice.paid", invoice("in_1"));
ok((await sql`select count(*)::int c from contributions where stripe_invoice_id='in_1'`)[0].c === 2, "same invoice never double-counted");

// Over-limit backstop: pretend this donor already gave $1,400 to council this year.
const mp = (await sql`select id from people where email='monthly@example.com'`)[0];
await sql`insert into contributions (person_id, kind, frequency, slate, amount_cents, status, contributor_name, contributor_address, contributor_city, contributor_postal_code, eligibility_attested_at, paid_at)
  values (${mp.id}, 'donation', 'one_time', 'council', 140000, 'succeeded', 'x', 'x', 'x', 'x', now(), now())`;
await webhook("invoice.paid", invoice("in_2"));
const over = (await sql`select refunded_cents, status from contributions where stripe_invoice_id='in_2' and slate='council'`)[0];
const log = await stripeLog();
const refund = log.find((l) => l.path === "/v1/refunds");
ok(
  over.refunded_cents === Math.min(11900, 11900 + 140000 + 11900 - 142970) && over.status === "refunded_over_limit" && refund?.params.amount === String(over.refunded_cents) && refund.idem === "over-limit-pi_for_in_2",
  `over-limit excess of ${over.refunded_cents}¢ refunded automatically`,
);
ok((await sql`select refunded_cents from contributions where stripe_invoice_id='in_2' and slate='school_board'`)[0].refunded_cents === 0, "other slate untouched");
await webhook("customer.subscription.deleted", { id: "sub_1", object: "subscription" });
ok((await sql`select status from recurring_donations where stripe_subscription_id='sub_1'`)[0].status === "cancelled", "cancelled subscription recorded");

// Dashboard refund
await webhook("charge.refunded", { id: "ch_1", object: "charge", payment_intent: `pi_${donSession}`, amount: 5000, amount_refunded: 5000 });
ok((await sql`select status from contributions where stripe_checkout_session_id=${donSession}`)[0].status === "refunded", "full refund from the Stripe dashboard recorded");

// Expired checkout
r = await post("/api/donations/checkout", { ...donor, email: "late@example.com", frequency: "one_time", tier: "standard", amountCents: 2500 });
await webhook("checkout.session.expired", { id: sid(r.body.url), object: "checkout.session", metadata: {}, payment_status: "unpaid" });
ok((await sql`select status from contributions where stripe_checkout_session_id=${sid(r.body.url)}`)[0].status === "failed", "expired checkout marked failed");

// ── Shop ──────────────────────────────────────────────────────────────────
r = await post("/api/shop/checkout", { items: [{ slug: "stop-doug-lawn-sign", quantity: 2 }, { slug: "window-sign", quantity: 1 }, { slug: "stop-doug-lawn-sign", quantity: 1 }] });
const shopS = await fakeSession(sid(r.body.url));
ok(r.status === 200 && shopS.amount_total === 6500 && shopS.params.shipping_address_collection.allowed_countries["0"] === "CA", "shop checkout: 3 signs + window sign = $65, ships in Canada");
r = await post("/api/shop/checkout", { items: [{ slug: "nope", quantity: 1 }] });
ok(r.status === 422, "unknown product refused");
await completed(shopS.id, {
  customer_details: { email: "buyer@example.com", phone: "6045550100" },
  collected_information: { shipping_details: { name: "Buyer", address: { line1: "1 Main", city: "Surrey", country: "CA", postal_code: "V3T 1V8", state: "BC" } } },
});
const order = (await sql`select status, email, shipping from orders where stripe_checkout_session_id=${shopS.id}`)[0];
ok(order.status === "paid" && order.email === "buyer@example.com" && order.shipping.address.city === "Surrey", "order paid with shipping address");

// ── Petition and pledge ───────────────────────────────────────────────────
r = await post("/api/signatures", { campaign: "skytrain-south-surrey", firstName: "Raj", lastName: "P", email: "raj@example.com", postalCode: "v4a1a1", answer: "Park & Ride", consent: true });
ok(r.status === 200, "petition signed");
r = await post("/api/signatures", { campaign: "skytrain-south-surrey", firstName: "Raj", lastName: "P", email: "raj@example.com", postalCode: "v4a1a1", consent: true });
ok(r.status === 200 && (await sql`select count(*)::int c from campaign_signatures where email='raj@example.com'`)[0].c === 1, "signing twice keeps one signature");
r = await post("/api/signatures", { campaign: "stop-mccallum-pledge", firstName: "Raj", lastName: "P", email: "raj@example.com", postalCode: "V4A 1A1", consent: true });
ok(r.status === 200 && (await sql`select count(*)::int c from campaign_signatures where email='raj@example.com'`)[0].c === 2, "pledge signed separately");

// ── Events ────────────────────────────────────────────────────────────────
await sql`insert into events (slug, title, starts_at, location, summary) values ('town-hall', 'Newton town hall', now() + interval '10 days', 'Newton Seniors Centre', 'Bring your questions.') on conflict do nothing`;
r = await post("/api/events/town-hall/rsvp", { name: "Raj Patel", email: "raj@example.com", guests: 2, newsletter: true });
ok(r.status === 200 && (await sql`select guests from event_rsvps where email='raj@example.com'`)[0].guests === 2, "RSVP recorded");
r = await post("/api/events/nope/rsvp", { name: "X", email: "x@example.com" });
ok(r.status === 404, "RSVP to unknown event 404s");
const home = await (await fetch(BASE + "/")).text();
ok(home.includes("Newton town hall"), "home page shows the upcoming event from the database");

// ── Unsubscribe ───────────────────────────────────────────────────────────
const tok = (await sql`select unsubscribe_token from newsletter_subscribers where email='news@example.com'`)[0].unsubscribe_token;
await fetch(BASE + "/api/newsletter/unsubscribe", { method: "POST", body: new URLSearchParams({ token: tok }), redirect: "manual" });
ok((await sql`select status from newsletter_subscribers where email='news@example.com'`)[0].status === "unsubscribed", "unsubscribe works");

// ── Admin ─────────────────────────────────────────────────────────────────
let a = await fetch(BASE + "/api/admin/export/members", { redirect: "manual" });
ok(a.status === 401, "CSV export requires sign-in");
a = await fetch(BASE + "/admin", { redirect: "manual" });
ok(a.status === 307 || a.status === 303, `admin redirects to login (status ${a.status})`);
a = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ password: "wrong" }), redirect: "manual" });
ok(a.headers.get("location")?.includes("error=1"), "wrong admin password rejected");
a = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ password: ADMIN_PASSWORD }), redirect: "manual" });
const cookie = a.headers.get("set-cookie")?.split(";")[0];
ok(!!cookie, "admin signs in");
const csv = await (await fetch(BASE + "/api/admin/export/contributions", { headers: { cookie } })).text();
ok(csv.startsWith("paid_at,contributor_name") && csv.includes("membership_fee"), "contributions CSV exported");
const dash = await (await fetch(BASE + "/admin", { headers: { cookie } })).text();
ok(dash.includes("Active members") && dash.includes("asha@example.com"), "admin dashboard lists members");

await finish();
