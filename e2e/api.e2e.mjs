// Every public form, every Stripe webhook path, and the admin API, against a
// real database and the fake Stripe server. Run with `npm run e2e` or
// `npm run e2e -- api`.
import Stripe from "stripe";
import {
  BASE,
  WEBHOOK_SECRET,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  sql,
  ok,
  finish,
  post,
  fakeSession,
  stripeLog,
  stripeObject,
  stripeEvent as webhook,
  sessionIdFromUrl as sid,
  ensureAdmin,
} from "./helpers.mjs";

const stripe = new Stripe("sk_test_x");
const LIMIT = 142970;
const OVER_LIMIT = (slate) =>
  `That would take you over this year's $1,429.70 contribution limit for our ${slate}. Try a smaller amount, or email hello@imaginesurrey.ca if you think this is a mistake.`;
const seconds = (d) => Math.floor(new Date(d).getTime() / 1000);
const pacificMonthIndex = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", month: "numeric" }).format(new Date())) - 1;

const completed = async (id, extra = {}, opts = {}) => {
  const s = await fakeSession(id);
  return webhook(
    "checkout.session.completed",
    {
      id,
      object: "checkout.session",
      mode: s.mode,
      metadata: s.metadata,
      payment_status: "paid",
      payment_intent: `pi_${id}`,
      customer: "cus_123",
      amount_total: s.amount_total,
      ...extra,
    },
    opts,
  );
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

// A supporter with a share code sent Asha here.
await sql`update people set referral_code='ABCDEF23' where email='news@example.com'`;
r = await post("/api/membership", { ...member, source: "flyer", ref: "abcdef23" });
ok(r.status === 200 && r.body.status === "checkout", "membership creates Stripe checkout (optional source and ref accepted)");
const memSession = sid(r.body.url);
const memParams = (await fakeSession(memSession)).params;
ok(
  memParams.line_items["0"].price_data.unit_amount === "1000" && memParams.customer_email === "asha@example.com" && memParams.customer_creation === "always",
  "membership checkout charges $10 to the member's email and asks Stripe to create a customer",
);
ok(Number(memParams.expires_at) - Math.floor(Date.now() / 1000) > 31 * 60, "checkout expiry leaves Stripe's 30-minute minimum some margin");
let p = (await sql`select source, referred_by_id = (select id from people where email='news@example.com') as referred from people where email='asha@example.com'`)[0];
ok(p.source === "flyer" && p.referred === true, "source and referral recorded on the person");
let pendingMembership = (await sql`select status, member_name, member_address, member_city, member_postal_code, member_neighbourhood from memberships where stripe_checkout_session_id=${memSession}`)[0];
ok(
  pendingMembership.status === "pending_payment" && pendingMembership.member_name === "Asha Singh" && pendingMembership.member_postal_code === "V3T 1V8" && pendingMembership.member_neighbourhood === "Whalley" && pendingMembership.member_city === "Surrey",
  "member details snapshotted on the membership row",
);
const memPaidAt = Math.floor(Date.now() / 1000) - 600;
let w = await completed(memSession, {}, { created: memPaidAt });
ok(w.status === 200 && w.body.result === "processed", "membership webhook processed");
let m = (await sql`select m.status, m.voting_eligible, m.expires_at > now() + interval '364 days' as year from memberships m join people p on p.id=m.person_id where p.email='asha@example.com'`)[0];
ok(m.status === "active" && m.voting_eligible && m.year, "membership active for a year, voting eligible");
let c = (await sql`select status, kind, amount_cents, contributor_postal_code, paid_at from contributions where stripe_checkout_session_id=${memSession}`)[0];
ok(c.status === "succeeded" && c.kind === "membership_fee" && c.contributor_postal_code === "V3T 1V8", "membership fee recorded as a contribution");
ok(seconds(c.paid_at) === memPaidAt, "paid_at is the Stripe event's time, not when the webhook ran");
p = (await sql`select stripe_customer_id, stripe_customer_mode from people where email='asha@example.com'`)[0];
ok(p.stripe_customer_id === "cus_123" && p.stripe_customer_mode === "test", "Stripe customer remembered along with its mode");
const resend = await fetch(BASE + "/api/stripe/webhook", {
  method: "POST",
  headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: w.payload, secret: WEBHOOK_SECRET }) },
  body: w.payload,
});
ok((await resend.json()).result === "duplicate", "replayed webhook is ignored");
const bad = await fetch(BASE + "/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef" }, body: w.payload });
ok(bad.status === 400, "webhook with bad signature rejected");

// Joining again never reveals the existing membership; it extends it.
r = await post("/api/membership", member);
ok(r.status === 200 && r.body.status === "checkout" && Object.keys(r.body).sort().join() === "status,url", "joining again gets a checkout and nothing that says the email is a member's");
const memSession2 = sid(r.body.url);
ok((await fakeSession(memSession2)).params.customer === "cus_123", "the remembered Stripe customer is reused");
w = await completed(memSession2);
const terms = await sql`select m.status, m.starts_at, m.expires_at from memberships m join people p on p.id=m.person_id where p.email='asha@example.com' order by m.created_at`;
ok(
  terms.length === 2 && terms[1].status === "active" && seconds(terms[1].starts_at) === seconds(terms[0].expires_at) && seconds(terms[1].expires_at) > seconds(terms[0].expires_at),
  "second membership starts when the first ends",
);
const welcome = await (await fetch(`${BASE}/join/welcome?session_id=${memSession2}`)).text();
ok(welcome.includes("runs until"), "welcome page shows when the membership runs to");
const welcomeUnknown = await (await fetch(`${BASE}/join/welcome?session_id=cs_test_nope`)).text();
ok(!welcomeUnknown.includes("runs until") && welcomeUnknown.includes("Thanks for joining"), "welcome page is generic without a known session");

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
r = await post("/api/donations/checkout", { ...donor, frequency: "one_time", tier: "standard", amountCents: 5000, source: "share-link" });
ok(r.status === 200, "one-time donation checkout");
const donSession = sid(r.body.url);
const donPaidAt = Math.floor(Date.now() / 1000) - 3600;
w = await completed(donSession, {}, { created: donPaidAt });
c = (await sql`select status, paid_at from contributions where stripe_checkout_session_id=${donSession}`)[0];
ok(c.status === "succeeded" && seconds(c.paid_at) === donPaidAt, "donation recorded as succeeded at the event's time");
ok((await sql`select source from people where email='asha@example.com'`)[0].source === "flyer", "a later form never overwrites where the person first came from");
r = await post("/api/donations/checkout", { ...donor, frequency: "one_time", tier: "star", amountCents: 0 });
ok(r.status === 422 && r.body.error === OVER_LIMIT("city council slate"), "Star Club refused after $70 given, with a message that reveals no amounts");
r = await post("/api/donations/checkout", { ...donor, email: "star@example.com", frequency: "one_time", tier: "superstar", amountCents: 0 });
const ss = await fakeSession(sid(r.body.url));
ok(r.status === 200 && Object.keys(ss.params.line_items).length === 2 && ss.amount_total === 285940, "Superstar one-time is two line items totalling $2,859.40");
const ssRows = await sql`select slate, amount_cents from contributions where stripe_checkout_session_id=${ss.id} order by slate`;
ok(ssRows.length === 2 && ssRows[0].slate === "council" && ssRows[1].slate === "school_board", "Superstar recorded per slate");

// Two tabs: an open checkout never blocks another; the webhook returns any excess.
r = await post("/api/donations/checkout", { ...donor, email: "star@example.com", frequency: "one_time", tier: "standard", amountCents: 1000 });
ok(r.status === 200, "an open checkout doesn't count against a second one");
const smallSession = sid(r.body.url);
await completed(ss.id);
w = await completed(smallSession);
const backstop = (await sql`select id, status, refunded_cents, refund_pending_cents from contributions where stripe_checkout_session_id=${smallSession}`)[0];
let refund = (await stripeLog()).find((l) => l.path === "/v1/refunds" && l.idem === `over-limit-${backstop.id}`);
ok(
  w.body.result === "processed" && backstop.status === "refunded_over_limit" && backstop.refunded_cents === 1000 && backstop.refund_pending_cents === 0,
  "the second payment is returned in full once the webhook has responded (nothing left pending)",
);
ok(refund?.params.amount === "1000" && refund.params.payment_intent === `pi_${smallSession}`, "over-limit refund issued against the payment intent, keyed by contribution");

// Partial refunds from the Stripe dashboard are reconciled, council first.
const ssCharge = { id: "ch_ss", object: "charge", payment_intent: `pi_${ss.id}`, amount: 285940 };
await webhook("charge.refunded", { ...ssCharge, amount_refunded: 50000 });
let ssRefunds = await sql`select slate, status, refunded_cents from contributions where stripe_checkout_session_id=${ss.id} order by slate`;
ok(ssRefunds[0].refunded_cents === 50000 && ssRefunds[0].status === "succeeded" && ssRefunds[1].refunded_cents === 0, "partial dashboard refund comes off the council row first");
await webhook("charge.refunded", { ...ssCharge, amount_refunded: 200000 });
ssRefunds = await sql`select slate, status, refunded_cents from contributions where stripe_checkout_session_id=${ss.id} order by slate`;
ok(
  ssRefunds[0].refunded_cents === 142970 && ssRefunds[0].status === "refunded" && ssRefunds[1].refunded_cents === 57030 && ssRefunds[1].status === "succeeded",
  "a larger refund fills council and spills into school board; only the full row is marked refunded",
);
await webhook("charge.refunded", { ...ssCharge, amount_refunded: 285940 });
ssRefunds = await sql`select slate, status, refunded_cents from contributions where stripe_checkout_session_id=${ss.id} order by slate`;
ok(ssRefunds.every((x) => x.status === "refunded" && x.refunded_cents === 142970), "full refund marks both rows refunded");

// Stripe customers are only reused in the mode that created them.
await sql`update people set stripe_customer_id='cus_live_1', stripe_customer_mode='live' where email='star@example.com'`;
r = await post("/api/donations/checkout", { ...donor, email: "star@example.com", frequency: "one_time", tier: "standard", amountCents: 1000 });
let params = (await fakeSession(sid(r.body.url))).params;
ok(r.status === 200 && params.customer === undefined && params.customer_email === "star@example.com", "a customer id from the other Stripe mode is not reused");
await sql`update people set stripe_customer_id='cus_missing', stripe_customer_mode='test' where email='star@example.com'`;
r = await post("/api/donations/checkout", { ...donor, email: "star@example.com", frequency: "one_time", tier: "standard", amountCents: 1000 });
params = (await fakeSession(sid(r.body.url))).params;
ok(
  r.status === 200 && params.customer === undefined && params.customer_email === "star@example.com" && (await sql`select stripe_customer_id from people where email='star@example.com'`)[0].stripe_customer_id === null,
  "a customer Stripe no longer knows is forgotten and the checkout retried without it",
);

// A session delivered without its metadata is re-read from Stripe.
r = await post("/api/donations/checkout", { ...donor, email: "bare@example.com", frequency: "one_time", tier: "standard", amountCents: 2500 });
const bareSession = sid(r.body.url);
w = await completed(bareSession, { metadata: undefined });
ok(w.body.result === "processed" && (await sql`select status from contributions where stripe_checkout_session_id=${bareSession}`)[0].status === "succeeded", "a checkout event missing its metadata is re-read and still recorded");

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
const over = (await sql`select id, refunded_cents, refund_pending_cents, status from contributions where stripe_invoice_id='in_2' and slate='council'`)[0];
refund = (await stripeLog()).find((l) => l.path === "/v1/refunds" && l.idem === `over-limit-${over.id}`);
ok(
  over.refunded_cents === 11900 && over.refund_pending_cents === 0 && over.status === "refunded_over_limit" && refund?.params.amount === "11900" && refund.params.payment_intent === "pi_for_in_2",
  `over-limit monthly payment of ${over.refunded_cents}¢ refunded automatically`,
);
ok((await sql`select refunded_cents from contributions where stripe_invoice_id='in_2' and slate='school_board'`)[0].refunded_cents === 0, "other slate untouched");
await webhook("customer.subscription.deleted", { id: "sub_1", object: "subscription" });
ok((await sql`select status from recurring_donations where stripe_subscription_id='sub_1'`)[0].status === "cancelled", "cancelled subscription recorded");

// Endpoints on API versions before 2025-03-31 deliver invoices in the old shape.
r = await post("/api/donations/checkout", { ...donor, email: "monthly2@example.com", frequency: "monthly", tier: "standard", amountCents: 2500 });
const mon2 = await fakeSession(sid(r.body.url));
await completed(mon2.id, { subscription: "sub_2", payment_intent: null });
const legacyPaidAt = Math.floor(Date.now() / 1000) - 7200;
w = await webhook("invoice.paid", {
  id: "in_legacy",
  object: "invoice",
  subscription: "sub_2",
  subscription_details: { metadata: mon2.params.subscription_data.metadata },
  payment_intent: "pi_legacy_1",
  status_transitions: { paid_at: legacyPaidAt },
});
const legacy = (await sql`select amount_cents, stripe_payment_intent_id, stripe_subscription_id, paid_at from contributions where stripe_invoice_id='in_legacy'`)[0];
ok(
  w.body.result === "processed" && legacy?.amount_cents === 2500 && legacy.stripe_payment_intent_id === "pi_legacy_1" && legacy.stripe_subscription_id === "sub_2" && seconds(legacy.paid_at) === legacyPaidAt,
  "invoice.paid in the legacy shape (invoice.subscription, no parent) still records the payment with the invoice's paid_at",
);
await stripeObject({
  id: "in_bare",
  object: "invoice",
  status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_2", metadata: {} } },
});
w = await webhook("invoice.paid", { id: "in_bare", object: "invoice" });
ok(
  w.body.result === "processed" && (await sql`select count(*)::int c from contributions where stripe_invoice_id='in_bare'`)[0].c === 1 && (await stripeLog()).some((l) => l.method === "GET" && l.path === "/v1/invoices/in_bare"),
  "an invoice delivered without its subscription fields is re-read from Stripe",
);

// The first invoice can arrive before checkout.session.completed, without metadata: the subscription itself names the gift.
r = await post("/api/donations/checkout", { ...donor, email: "monthly3@example.com", frequency: "monthly", tier: "standard", amountCents: 1000 });
const mon3 = await fakeSession(sid(r.body.url));
await stripeObject({ id: "sub_3", object: "subscription", status: "active", metadata: mon3.params.subscription_data.metadata });
w = await webhook("invoice.paid", {
  id: "in_first",
  object: "invoice",
  status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_3", metadata: null } },
});
let gift3 = (await sql`select status, stripe_subscription_id from recurring_donations where stripe_checkout_session_id=${mon3.id}`)[0];
ok(
  w.body.result === "processed" && gift3.status === "active" && gift3.stripe_subscription_id === "sub_3" && (await sql`select count(*)::int c from contributions where stripe_invoice_id='in_first'`)[0].c === 1,
  "a first invoice arriving before the checkout event activates the gift via the subscription's metadata",
);

// Subscriptions Stripe stops collecting on stop reserving the donor's limit.
await webhook("customer.subscription.updated", { id: "sub_2", object: "subscription", status: "unpaid", cancel_at_period_end: false });
let sub2 = (await sql`select status, cancelled_at from recurring_donations where stripe_subscription_id='sub_2'`)[0];
ok(sub2.status === "cancelled" && sub2.cancelled_at !== null, "customer.subscription.updated with status unpaid cancels the recurring gift");
await webhook("customer.subscription.updated", { id: "sub_3", object: "subscription", status: "past_due", cancel_at_period_end: false });
ok((await sql`select status from recurring_donations where stripe_subscription_id='sub_3'`)[0].status === "active", "past_due keeps the gift active");
await webhook("customer.subscription.paused", { id: "sub_3", object: "subscription", status: "paused" });
ok((await sql`select status from recurring_donations where stripe_subscription_id='sub_3'`)[0].status === "cancelled", "a paused subscription is cancelled");
await webhook("customer.subscription.resumed", { id: "sub_3", object: "subscription", status: "active" });
gift3 = (await sql`select status, cancelled_at from recurring_donations where stripe_subscription_id='sub_3'`)[0];
ok(gift3.status === "active" && gift3.cancelled_at === null, "a resumed subscription is active again");

// What the active $10/month gift still reserves this year: this month's payment has arrived, so one fewer.
const reserved = 1000 * (12 - pacificMonthIndex - 1);
const room = LIMIT - 1000 - reserved;
r = await post("/api/donations/checkout", { ...donor, email: "monthly3@example.com", frequency: "one_time", tier: "standard", amountCents: room });
ok(r.status === 200, `a one-time gift that exactly fills the room beside the monthly gift (${room}¢) is accepted`);
r = await post("/api/donations/checkout", { ...donor, email: "monthly3@example.com", frequency: "one_time", tier: "standard", amountCents: room + 1 });
ok(r.status === 422 && r.body.error === OVER_LIMIT("city council slate"), "one cent more is refused without revealing amounts");
r = await post("/api/donations/checkout", { ...donor, email: "monthly3@example.com", frequency: "monthly", tier: "star", amountCents: 0 });
ok(r.status === 422 && r.body.error === OVER_LIMIT("city council slate"), "a Star Club monthly gift beside an active monthly gift would not fit a full year");

// Dashboard refund of a whole payment
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
  customer_details: { email: "Buyer@Example.com", phone: "6045550100" },
  collected_information: { shipping_details: { name: "Buyer", address: { line1: "1 Main", city: "Surrey", country: "CA", postal_code: "V3T 1V8", state: "BC" } } },
});
const order = (await sql`select o.status, o.email, o.shipping, p.email as person_email, p.source from orders o left join people p on p.id=o.person_id where o.stripe_checkout_session_id=${shopS.id}`)[0];
ok(
  order.status === "paid" && order.email === "buyer@example.com" && order.shipping.address.city === "Surrey" && order.shipping.phone === "6045550100" && order.person_email === "buyer@example.com" && order.source === "shop",
  "order paid with shipping address and linked to a person by lowercased email",
);
r = await post("/api/shop/checkout", { items: [{ slug: "tote-bag", quantity: 1 }] });
const shopLegacy = sid(r.body.url);
await completed(shopLegacy, {
  customer_details: { email: "buyer@example.com", phone: null },
  shipping_details: { name: "Buyer", address: { line1: "2 Main", city: "Delta", country: "CA", postal_code: "V4K 1A1", state: "BC" } },
});
ok((await sql`select shipping from orders where stripe_checkout_session_id=${shopLegacy}`)[0].shipping?.address?.city === "Delta", "shipping in the legacy session shape is recorded too");

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
await ensureAdmin();
a = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: ADMIN_EMAIL, password: "wrong" }), redirect: "manual" });
ok(a.headers.get("location")?.includes("error=invalid"), "wrong admin password rejected");
a = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }), redirect: "manual" });
const cookie = a.headers.get("set-cookie")?.split(";")[0];
ok(!!cookie, "admin signs in");
const csv = await (await fetch(BASE + "/api/admin/export/contributions", { headers: { cookie } })).text();
ok(csv.startsWith("paid_at,contributor_name") && csv.includes("membership_fee"), "contributions CSV exported");
const dash = await (await fetch(BASE + "/admin", { headers: { cookie } })).text();
ok(dash.includes("Active members") && dash.includes("asha@example.com"), "admin dashboard lists members");

await finish();
