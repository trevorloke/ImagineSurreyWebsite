// The supporter CRM, dashboard, exports, staff accounts, own account and
// audit log, against a real database. Page reads go through fetch with the
// session cookie; forms built on server actions run in a real browser.
//   ADMIN_EMAIL=admin@example.com npm run e2e -- admin
import { chromium } from "playwright";
import { BASE, ADMIN_PASSWORD, sql, ok, finish } from "./helpers.mjs";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();

// ── Sign in ───────────────────────────────────────────────────────────────
let r = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: ADMIN_EMAIL, password: "wrong" }), redirect: "manual" });
ok(r.headers.get("location")?.includes("error=invalid"), "wrong password is refused");
r = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }), redirect: "manual" });
const cookie = r.headers.get("set-cookie")?.split(";")[0];
ok(r.status === 303 && cookie && !r.headers.get("location")?.includes("error"), "owner signs in with email and password");
const page$ = async (path) => {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  // React separates adjacent text nodes with <!-- --> in server HTML; drop them so phrases can be matched.
  return { status: res.status, location: res.headers.get("location"), text: (await res.text()).replace(/<!--.*?-->/g, "") };
};
const tableBody = (html) => html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? "";
const tile = (html, label) => html.match(new RegExp(`<div class="value">([^<]*)</div><div class="label">(?:<a [^>]*>)?${label}`))?.[1];

// ── Supporters, created straight in the database ──────────────────────────
await sql`delete from people where email like '%@crm.example'`;
const [asha] = await sql`insert into people (email, first_name, last_name, phone, address, city, province, postal_code, neighbourhood, languages, interest_volunteer, tags, source, contact_consent_at, sms_consent_at, referral_code, created_at)
  values ('asha@crm.example', 'Asha', 'Singh', '604-555-0199', '13450 104 Ave', 'Surrey', 'BC', 'V3T 1V8', 'Whalley', array['English','Punjabi'], true, array['canvasser'], 'membership', now() - interval '3 days', now() - interval '3 days', 'ASHA2026', now() - interval '3 days') returning id`;
const [raj] = await sql`insert into people (email, first_name, last_name, neighbourhood, source, referred_by_id, created_at)
  values ('raj@crm.example', 'Raj', 'Patel', 'Newton', 'petition:skytrain', ${asha.id}, now() - interval '10 days') returning id`;
const [mei] = await sql`insert into people (email, first_name, last_name, neighbourhood, interest_lawn_sign, locale, source, created_at)
  values ('mei@crm.example', 'Mei', 'Chen', 'Fleetwood', true, 'zh-Hans', 'event:town-hall', now() - interval '40 days') returning id`;
const [old] = await sql`insert into people (email, first_name, last_name, neighbourhood, created_at) values ('old@crm.example', 'Olu', 'Bello', 'Guildford', now() - interval '400 days') returning id`;
const [pat] = await sql`insert into people (email, first_name, last_name, phone, address, postal_code, tags, contact_consent_at, created_at)
  values ('pat@crm.example', 'Pat', 'Doe', '604-555-0123', '1 Main St', 'V3W 1A1', array['canvasser','donor'], now(), now() - interval '1 day') returning id`;
await sql`insert into memberships (person_id, status, fee_cents, voting_eligible, starts_at, expires_at, member_name, member_address, member_city, member_postal_code) values
  (${asha.id}, 'active', 1000, true, now() - interval '60 days', now() + interval '300 days', 'Asha Singh', '13450 104 Ave', 'Surrey', 'V3T 1V8'),
  (${old.id}, 'active', 1000, true, now() - interval '370 days', now() - interval '5 days', 'Olu Bello', '1 Street', 'Surrey', 'V3R 1A1'),
  (${raj.id}, 'pending_payment', 1000, true, null, null, 'Raj Patel', '2 Street', 'Surrey', 'V3W 1A1')`;
await sql`update memberships set created_at = now() - interval '2 hours' where person_id = ${raj.id}`;
await sql`insert into contributions (person_id, kind, frequency, slate, amount_cents, refunded_cents, status, contributor_name, contributor_address, contributor_city, contributor_postal_code, eligibility_attested_at, paid_at) values
  (${asha.id}, 'donation', 'one_time', 'council', 5000, 0, 'succeeded', 'Asha Singh', '13450 104 Ave', 'Surrey', 'V3T 1V8', now(), now() - interval '1 day'),
  (${asha.id}, 'membership_fee', 'one_time', 'council', 1000, 0, 'succeeded', 'Asha Singh', '13450 104 Ave', 'Surrey', 'V3T 1V8', now(), now() - interval '60 days'),
  (${pat.id}, 'donation', 'one_time', 'council', 2500, 500, 'succeeded', 'Pat Doe', '1 Main St', 'Surrey', 'V3W 1A1', now(), now() - interval '2 days')`;
await sql`insert into newsletter_subscribers (email, person_id, status, source, unsubscribe_token, confirmed_at) values
  ('asha@crm.example', ${asha.id}, 'subscribed', 'membership', 'tok-asha-e2e', now()),
  ('pat@crm.example', ${pat.id}, 'subscribed', 'donation', 'tok-pat-e2e', now()),
  ('raj@crm.example', ${raj.id}, 'pending', 'home', 'tok-raj-e2e', null)`;
await sql`insert into campaign_signatures (campaign, person_id, first_name, last_name, email, postal_code, address, phone, source) values
  ('skytrain-south-surrey', ${raj.id}, 'Raj', 'Patel', 'raj@crm.example', 'V3W 1A1', null, null, 'facebook'),
  ('stop-mccallum-pledge', ${pat.id}, 'Pat', 'Doe', 'pat@crm.example', 'V3W 1A1', '1 Main St', '604-555-0123', 'poster')`;
const [event] = await sql`insert into events (slug, title, starts_at, location, summary) values ('crm-town-hall', 'CRM town hall', now() + interval '5 days', 'Hall', 'Test') on conflict (slug) do update set title = excluded.title returning id`;
await sql`insert into event_rsvps (event_id, person_id, name, email, guests, source) values (${event.id}, ${mei.id}, 'Mei Chen', 'mei@crm.example', 1, 'poster') on conflict do nothing`;
await sql`insert into email_log ("to", person_id, kind, subject, status, error, attempts) values ('asha@crm.example', ${asha.id}, 'test', 'A test email', 'failed', 'boom', 1)`;
await sql`insert into person_notes (person_id, author_name, body) values (${pat.id}, 'Someone', 'Called about the lawn sign.')`;

// ── Dashboard ─────────────────────────────────────────────────────────────
let dash = await page$("/admin");
ok(dash.status === 200 && dash.text.includes("Needs attention") && dash.text.includes("<svg"), "dashboard renders with sparklines");
ok(tile(dash.text, "Active members") === "1", `active members counts one person with a live membership (got ${tile(dash.text, "Active members")})`);
ok(tile(dash.text, "Raised this year") === "$80", `raised this year is net of refunds (got ${tile(dash.text, "Raised this year")})`);
ok(tile(dash.text, "Newsletter subscribers") === "2", "pending newsletter sign-ups are not counted as subscribers");
ok(dash.text.includes("emails failed to send today") && dash.text.includes("memberships pending payment for over an hour"), "needs-attention lists failed emails and stale pending memberships");
ok(!dash.text.includes("asha@crm.example"), "dataset tables have moved off the dashboard");
dash = await page$("/admin?denied=users");
ok(dash.text.includes("can&#x27;t open that section"), "dashboard explains a permission redirect");

// ── Exports ───────────────────────────────────────────────────────────────
let ex = await page$("/admin/exports?view=members");
ok(ex.status === 200 && ex.text.includes("Download Members CSV") && ex.text.includes("asha@crm.example") && ex.text.includes("expired"), "exports page shows the members table with derived status");
let csv = await (await fetch(BASE + "/api/admin/export/contributions", { headers: { cookie } })).text();
ok(csv.startsWith("paid_at,contributor_name") && csv.includes("membership_fee"), "contributions CSV header and rows");
ok(/\n\d{4}-\d{2}-\d{2} \d{2}:\d{2},Asha Singh/.test(csv), "timestamps are formatted in SQL as Pacific YYYY-MM-DD HH:MI");
csv = await (await fetch(BASE + "/api/admin/export/newsletter", { headers: { cookie } })).text();
ok(csv.split("\r\n")[0].endsWith(",unsubscribe_url") && csv.includes("/newsletter/unsubscribe?token=tok-asha-e2e"), "newsletter CSV carries an unsubscribe link");
csv = await (await fetch(BASE + "/api/admin/export/members", { headers: { cookie } })).text();
ok(csv.includes("old@crm.example") && /old@crm\.example[^\n]*,expired,/.test(csv), "members CSV derives expired from the expiry date");
csv = await (await fetch(BASE + "/api/admin/export/shifts?from=2030-01-01&to=2030-01-31", { headers: { cookie } })).text();
ok(csv.startsWith("date,slot,volunteer") && csv.trim().split("\r\n").length === 1, "shifts CSV takes from/to and streams a header even with no rows");
r = await fetch(BASE + "/api/admin/export/nope", { headers: { cookie } });
ok(r.status === 404, "unknown dataset is a 404");

// ── Searching and filtering ───────────────────────────────────────────────
const people = async (query) => (await page$("/admin/people" + query)).text;
let list = await people("?q=asha");
ok(list.includes("asha@crm.example") && !list.includes("raj@crm.example"), "search by name");
list = await people("?q=604-555-0199");
ok(list.includes("asha@crm.example") && !list.includes("pat@crm.example"), "search by phone digits");
list = await people("?q=v3t1v8");
ok(list.includes("asha@crm.example") && !list.includes("pat@crm.example"), "search by postal code");
list = await people("?q=%25%25");
ok(list.includes("<strong>0</strong> supporters"), "ILIKE wildcards in the search are escaped");
list = await people("?membership=active");
ok(list.includes("asha@crm.example") && !list.includes("old@crm.example") && !list.includes("raj@crm.example"), "membership filter: active");
list = await people("?membership=expired");
ok(list.includes("old@crm.example") && !list.includes("asha@crm.example"), "membership filter: expired is derived from expires_at");
list = await people("?membership=pending");
ok(list.includes("raj@crm.example") && !list.includes("asha@crm.example"), "membership filter: pending payment");
list = await people("?membership=none");
ok(list.includes("mei@crm.example") && list.includes("raj@crm.example") && !list.includes("old@crm.example"), "membership filter: never a member");
list = await people("?neighbourhood=Newton");
ok(list.includes("raj@crm.example") && !list.includes("asha@crm.example"), "neighbourhood filter");
list = await people("?volunteer=1");
ok(list.includes("asha@crm.example") && !list.includes("mei@crm.example"), "volunteer interest filter");
list = await people("?lawnsign=1");
ok(list.includes("mei@crm.example") && !list.includes("asha@crm.example"), "lawn sign filter");
list = await people("?tag=donor");
ok(list.includes("pat@crm.example") && !list.includes("asha@crm.example"), "tag filter");
list = await people("?source=petition%3Askytrain");
ok(list.includes("raj@crm.example") && !list.includes("asha@crm.example"), "source filter");
list = await people("?newsletter=pending");
ok(list.includes("raj@crm.example") && !list.includes("asha@crm.example"), "newsletter status filter");
list = await people("?newsletter=none");
ok(list.includes("mei@crm.example") && !list.includes("asha@crm.example"), "newsletter: not on the list");
list = await people("?sms=yes");
ok(list.includes("asha@crm.example") && !list.includes("pat@crm.example"), "SMS consent filter");
list = await people("?donated=1");
ok(list.includes("asha@crm.example") && list.includes("pat@crm.example") && !list.includes("raj@crm.example"), "donated this year filter");
list = await people("?language=punjabi");
ok(list.includes("asha@crm.example") && !list.includes("mei@crm.example"), "language filter matches spoken languages");
list = await people("?language=zh-Hans");
ok(list.includes("mei@crm.example") && !list.includes("asha@crm.example"), "language filter matches the preferred locale");
list = await people("?sort=name&q=crm.example");
ok(list.indexOf("asha@crm.example") < list.indexOf("mei@crm.example") && list.indexOf("mei@crm.example") < list.indexOf("raj@crm.example"), "sort by name");
// Fifty-five more, to exercise paging.
await sql`insert into people (email, first_name, last_name, tags, neighbourhood) select 'bulk-' || s || '@crm.example', 'Bulk', 'Person ' || s, array['bulk'], 'Cloverdale' from generate_series(1, 55) s`;
list = await people("?tag=bulk");
ok(list.includes("<strong>55</strong> supporters") && list.includes("showing 1–50") && list.includes('aria-label="Page 2"'), "50 per page with a pager");
list = await people("?tag=bulk&page=2");
// Each row's email also appears once in the page's inline data, so count distinct addresses.
ok(list.includes("showing 51–55") && new Set(list.match(/bulk-\d+@crm\.example/g)).size === 5, "page 2 shows the remaining five");
r = await fetch(BASE + "/admin/people", { redirect: "manual" });
ok(r.status === 307 || r.status === 303, "supporters page needs a session");

// ── Profile, tags, notes and anonymization in a real browser ─────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// The site honours prefers-reduced-motion, which also turns off smooth scrolling, so clicks never race an animation.
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("dialog", (d) => d.accept());
await page.goto(BASE + "/admin/login");
await page.fill("#email", ADMIN_EMAIL);
await page.fill("#password", ADMIN_PASSWORD);
await page.click('form[action="/api/admin/login"] button[type=submit]');
await page.waitForURL(/\/admin(?!\/login)/);

await page.goto(`${BASE}/admin/people/${asha.id}`);
let body = await page.locator("main, body").first().textContent();
ok(body.includes("Asha Singh") && body.includes("asha@crm.example") && body.includes("Member until"), "profile shows the supporter and membership");
const timeline = await page.locator(".timeline").textContent();
ok(timeline.includes("Membership") && timeline.includes("Donation") && timeline.includes("$50") && timeline.includes("Email: A test email") && timeline.includes("failed"), "timeline merges memberships, contributions and the email log");
ok(body.includes("ASHA2026") && body.includes("Raj Patel"), "referral code and the person they referred are shown");
ok(body.includes("Consented") && body.includes("Subscribed") && body.includes("read-only"), "consent panel shows email, SMS and newsletter status");

await page.fill("#new-tag", "Door Knocker");
await page.click('button:has-text("Add tag")');
await page.locator(".chip--tag", { hasText: "Door Knocker" }).waitFor();
let tags = (await sql`select tags from people where id = ${asha.id}`)[0].tags;
ok(tags.includes("canvasser") && tags.includes("Door Knocker"), "tag added from the profile");
await page.locator('.chip--tag:has-text("canvasser") button').click();
await page.locator('.chip--tag:has-text("canvasser")').waitFor({ state: "detached" });
await page.locator('[role="status"]', { hasText: "Removed the tag" }).waitFor();
tags = (await sql`select tags from people where id = ${asha.id}`)[0].tags;
ok(!tags.includes("canvasser") && tags.includes("Door Knocker"), "tag removed from the profile");

await page.fill("#note-body", "Spoke on the phone; happy to canvass Saturdays.");
await page.click('button:has-text("Add note")');
await page.locator(".note", { hasText: "canvass Saturdays" }).waitFor();
const note = (await sql`select author_name, body from person_notes where person_id = ${asha.id}`)[0];
ok(note?.author_name === "Owner" && note.body.includes("canvass"), "note stored with the author's name");

await page.locator("summary", { hasText: "Edit details" }).click();
await page.fill("#phone", "604-555-0100");
await page.fill("#issue", "SkyTrain");
await page.click('button:has-text("Save details")');
await page.locator('[role="status"]', { hasText: "Details saved" }).waitFor();
const edited = (await sql`select phone, issue, first_name from people where id = ${asha.id}`)[0];
ok(edited.phone === "604-555-0100" && edited.issue === "SkyTrain" && edited.first_name === "Asha", "edit form updates the record through updatePerson");

await page.goto(`${BASE}/admin/people/${pat.id}`);
await page.locator('input[name="confirm"]').check();
await page.click('button:has-text("Anonymize this supporter")');
await page.locator('[role="status"]', { hasText: "Personal details were removed" }).waitFor();
ok((await page.locator(".badge", { hasText: "Anonymized" }).count()) === 1 && (await page.locator('input[name="confirm"]').count()) === 0, "profile shows the record as anonymized and hides the form");
const anon = (await sql`select email, first_name, last_name, phone, address, tags, contact_consent_at from people where id = ${pat.id}`)[0];
ok(anon.email === `anonymized-${pat.id}@invalid` && anon.first_name === "Removed" && anon.phone === null && anon.address === null && anon.tags.length === 0 && anon.contact_consent_at === null, "anonymize replaces personal details and clears consents and tags");
ok((await sql`select count(*)::int c from person_notes where person_id = ${pat.id}`)[0].c === 0, "anonymize deletes notes");
ok((await sql`select status from newsletter_subscribers where email = 'pat@crm.example'`)[0]?.status === "unsubscribed", "anonymize unsubscribes the newsletter row");
const kept = (await sql`select contributor_name, amount_cents from contributions where person_id = ${pat.id}`)[0];
ok(kept?.contributor_name === "Pat Doe" && kept.amount_cents === 2500, "contribution rows and their contributor snapshot are kept");
ok((await sql`select first_name, email from campaign_signatures where person_id = ${pat.id}`)[0].first_name === "Removed", "signature rows no longer carry the name");

await page.goto(`${BASE}/admin/people?neighbourhood=Newton`);
await page.fill("#bulk-tag", "newton-2026");
await page.click('button:has-text("Add tag to all")');
await page.locator('[role="status"]', { hasText: "Added the tag" }).waitFor();
ok((await sql`select tags from people where id = ${raj.id}`)[0].tags.includes("newton-2026") && !(await sql`select tags from people where id = ${asha.id}`)[0].tags.includes("newton-2026"), "bulk tag applies to the filtered set only");

// ── Sources ───────────────────────────────────────────────────────────────
const sources = await page$("/admin/people/sources");
ok(sources.status === 200 && sources.text.includes("petition:skytrain") && sources.text.includes("poster") && sources.text.includes("ASHA2026"), "sources page lists sign-up sources and top referrers");

// ── Staff accounts ────────────────────────────────────────────────────────
await page.goto(BASE + "/admin/users");
await page.fill("#invite-name", "Nadia Organizer");
await page.fill("#invite-email", "nadia@crm.example");
await page.selectOption("#invite-role", "organizer");
await page.click('button:has-text("Create account")');
const inviteNotice = await page.locator('[role="status"]', { hasText: "Account created" }).textContent();
const oneTime = inviteNotice.match(/one-time password is (\S+) —/)?.[1];
const nadia = (await sql`select id, role, active, password_hash from admin_users where email = 'nadia@crm.example'`)[0];
ok(nadia?.role === "organizer" && nadia.active && nadia.password_hash && oneTime?.length >= 12, "invite creates the account and shows a one-time password once (no email configured)");
r = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: "nadia@crm.example", password: oneTime ?? "" }), redirect: "manual" });
const nadiaCookie = r.headers.get("set-cookie")?.split(";")[0];
ok(r.status === 303 && nadiaCookie && !r.headers.get("location")?.includes("error"), "the new staff member can sign in with it");
let denied = await fetch(BASE + "/admin/users", { headers: { cookie: nadiaCookie }, redirect: "manual" });
ok(denied.headers.get("location")?.includes("denied=users"), "an organizer is turned away from staff accounts");
denied = await fetch(BASE + "/api/admin/export/contributions", { headers: { cookie: nadiaCookie } });
ok(denied.status === 403, "an organizer can't export money datasets");
ok((await fetch(BASE + "/api/admin/export/people?tag=bulk", { headers: { cookie: nadiaCookie } })).status === 200, "but can export supporters");

const staffRow = page.locator(".staff", { hasText: "nadia@crm.example" });
await staffRow.locator("select[name=role]").selectOption("editor");
await staffRow.locator('button:has-text("Save role")').click();
await staffRow.locator('[role="status"]', { hasText: "Role changed to Editor" }).waitFor();
ok((await sql`select role from admin_users where id = ${nadia.id}`)[0].role === "editor", "role changed");
await staffRow.locator('button:has-text("Deactivate")').click();
await staffRow.locator('[role="status"]', { hasText: "deactivated" }).waitFor();
ok((await sql`select active from admin_users where id = ${nadia.id}`)[0].active === false, "account deactivated");
ok((await fetch(BASE + "/admin", { headers: { cookie: nadiaCookie }, redirect: "manual" })).status !== 200, "a deactivated account's session stops working");
await staffRow.locator('button:has-text("Reactivate")').click();
await staffRow.locator('[role="status"]', { hasText: "reactivated" }).waitFor();
await staffRow.locator('button:has-text("Reset password")').click();
const resetNotice = await staffRow.locator('[role="status"]', { hasText: "New password:" }).textContent();
const resetPw = resetNotice.match(/New password: (\S+) —/)?.[1];
r = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: "nadia@crm.example", password: resetPw ?? "" }), redirect: "manual" });
ok(r.status === 303 && !r.headers.get("location")?.includes("error"), "reset password works once shown");
// The reset signed Nadia out everywhere, so later checks as Nadia use this new session.
const nadiaCookie2 = r.headers.get("set-cookie")?.split(";")[0];
ok((await fetch(BASE + "/admin", { headers: { cookie: nadiaCookie }, redirect: "manual" })).status !== 200, "a password reset revokes the old sessions");

const ownerRow = page.locator(".staff", { hasText: ADMIN_EMAIL });
ok((await ownerRow.locator('button:has-text("Deactivate")').count()) === 0, "an owner has no deactivate button for themselves");
await ownerRow.locator("select[name=role]").selectOption("admin");
await ownerRow.locator('button:has-text("Save role")').click();
await ownerRow.locator('[role="alert"]', { hasText: "only active owner" }).waitFor();
ok((await sql`select role from admin_users where email = ${ADMIN_EMAIL}`)[0].role === "owner", "the last active owner can't be demoted");

// ── Audit log ─────────────────────────────────────────────────────────────
const actions = (await sql`select array_agg(distinct action) a from audit_log`)[0].a;
ok(["signin", "person.tag.add", "person.tag.remove", "person.note.add", "person.update", "person.anonymize", "people.tag.add", "staff.invite", "staff.role", "staff.deactivate", "staff.reactivate", "staff.reset-password", "export"].every((a) => actions.includes(a)), "audit entries exist for every action: " + actions.join(", "));
const anonAudit = (await sql`select user_email, entity, entity_id, details from audit_log where action = 'person.anonymize'`)[0];
ok(anonAudit.user_email === ADMIN_EMAIL && anonAudit.entity === "person" && anonAudit.entity_id === pat.id && !JSON.stringify(anonAudit.details).includes("pat@crm.example"), "anonymize entry names the record but not the erased email");
// The filter form lists every action, so look inside the table.
let auditPage = await page$(`/admin/audit?entity=${pat.id}`);
let auditRows = tableBody(auditPage.text);
ok(auditPage.status === 200 && auditRows.includes("person.anonymize") && !auditRows.includes("staff.invite"), "audit viewer filters by entity id");
auditPage = await page$("/admin/audit?action=staff.invite");
auditRows = tableBody(auditPage.text);
ok(auditRows.includes("nadia@crm.example") && !auditRows.includes("person.anonymize"), "audit viewer filters by action");
ok((await fetch(BASE + "/admin/audit", { headers: { cookie: nadiaCookie2 }, redirect: "manual" })).headers.get("location")?.includes("denied=users"), "audit log needs the users permission");

// ── Filtered CSV export ───────────────────────────────────────────────────
csv = await (await fetch(BASE + "/api/admin/export/people?membership=active&sort=name", { headers: { cookie } })).text();
const lines = csv.trim().split("\r\n");
ok(lines[0].startsWith("first_name,last_name,email,phone,address") && lines[0].includes(",membership,") && lines[0].endsWith(",created_at"), "supporter CSV header");
ok(lines.length === 2 && lines[1].includes("asha@crm.example") && lines[1].includes(",active,") && lines[1].includes("Door Knocker") && /,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(lines[1]), "filtered export has the one active member with tags and Pacific timestamps");
csv = await (await fetch(BASE + "/api/admin/export/people?tag=bulk", { headers: { cookie } })).text();
ok(csv.trim().split("\r\n").length === 56, "export covers the whole filtered set, not one page");

// ── My account ────────────────────────────────────────────────────────────
await page.goto(BASE + "/admin/account");
ok((await page.locator(".note", { hasText: "This device" }).count()) === 1, "account page lists the current session");
await page.fill("#account-name", "Site Owner");
await page.click('button:has-text("Save name")');
await page.locator('[role="status"]', { hasText: "Name saved" }).waitFor();
ok((await sql`select name from admin_users where email = ${ADMIN_EMAIL}`)[0].name === "Site Owner", "own name changed");
await page.fill("#current-password", "not-the-password");
await page.fill("#new-password", "a-much-longer-password-1");
await page.fill("#confirm-password", "a-much-longer-password-1");
await page.click('button:has-text("Change password")');
await page.locator('[role="alert"]', { hasText: "current password" }).waitFor();
await page.fill("#current-password", ADMIN_PASSWORD);
await page.fill("#new-password", "a-much-longer-password-1");
await page.fill("#confirm-password", "a-much-longer-password-1");
await page.click('button:has-text("Change password")');
await page.locator('[role="status"]', { hasText: "Password changed" }).waitFor();
r = await fetch(BASE + "/api/admin/login", { method: "POST", body: new URLSearchParams({ email: ADMIN_EMAIL, password: "a-much-longer-password-1" }), redirect: "manual" });
ok(r.status === 303 && !r.headers.get("location")?.includes("error"), "new password works");
ok((await fetch(BASE + "/admin/account", { headers: { cookie }, redirect: "manual" })).status !== 200, "the older API session was signed out by the password change");
ok((await page.goto(BASE + "/admin/account")).status() === 200, "the browser session that changed it stays signed in");
await page.click('button:has-text("Sign out everywhere")');
await page.waitForURL(/\/admin\/login/);
ok((await sql`select count(*)::int c from admin_sessions s join admin_users u on u.id = s.user_id where u.email = ${ADMIN_EMAIL} and s.revoked_at is null`)[0].c === 0, "sign out everywhere revokes every session");

const mobile = await browser.newPage({ viewport: { width: 360, height: 800 } });
await mobile.emulateMedia({ reducedMotion: "reduce" });
await mobile.goto(BASE + "/admin/login");
await mobile.fill("#email", ADMIN_EMAIL);
await mobile.fill("#password", "a-much-longer-password-1");
await mobile.click('form[action="/api/admin/login"] button[type=submit]');
await mobile.waitForURL(/\/admin(?!\/login)/);
for (const path of ["/admin", "/admin/people", `/admin/people/${asha.id}`, "/admin/users", "/admin/account"]) {
  await mobile.goto(BASE + path);
  const width = await mobile.evaluate(() => document.documentElement.scrollWidth);
  ok(width <= 360, `${path} has no sideways scroll on a phone (${width}px)`);
}

await browser.close();
await finish();
