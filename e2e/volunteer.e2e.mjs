// Self-serve volunteering and neighbourhood pages, in a real browser: an
// opening on /volunteer, a sign-up with a confirmation and calendar links,
// spots left going down, the duplicate and full cases, the .ics file, a town
// centre's page, the postal-code lookup, and an event's capacity on RSVP.
import { chromium } from "playwright";
import { BASE, sql, ok, finish, adminCookie, post } from "./helpers.mjs";

// Surrey's date today, then a Saturday at least a week out.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
const d = new Date(`${today}T00:00:00Z`);
d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7) + 7);
const saturday = d.toISOString().slice(0, 10);

await sql`delete from shifts where opening_id in (select id from shift_openings where title like 'E2E %')`;
await sql`delete from shift_openings where title like 'E2E %'`;
await sql`delete from event_rsvps where event_id in (select id from events where slug like 'e2e-%')`;
await sql`delete from events where slug like 'e2e-%'`;
const task = (await sql`select id from volunteer_tasks where name = 'Door-knocking'`)[0];
const [opening] = await sql`insert into shift_openings (date, slot, task_id, title, location, neighbourhood, capacity, notes, published)
  values (${saturday}, 'morning', ${task?.id ?? null}, 'E2E Door-knocking in Newton', 'Newton Seniors Centre', 'Newton', 3, 'Wear **comfortable** shoes.', true) returning id`;
await sql`insert into events (slug, title, starts_at, location, address, summary, neighbourhood, capacity) values
  ('e2e-newton-social', 'E2E Newton neighbourhood social', now() + interval '9 days', 'Newton Library', '13795 70 Ave, Surrey', 'Meet the Newton committee.', 'Newton', null),
  ('e2e-tiny-townhall', 'E2E Tiny town hall', now() + interval '12 days', 'City Hall', '13450 104 Ave, Surrey', 'One seat only.', null, 1)`;

// Rows written straight to the database are not on the cached public pages
// until something refreshes them, which an organizer's publish does.
const cookie = await adminCookie();
const publish = await fetch(`${BASE}/api/admin/openings/${opening.id}`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ published: true }) });
ok(publish.status === 200 && (await publish.json()).signedUp === 0, "organizer republishes the opening, which refreshes the public pages");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE + "/volunteer?source=e2e-whatsapp");
const card = page.locator(".opening-card", { hasText: "E2E Door-knocking in Newton" });
ok((await card.count()) === 1, "/volunteer lists the published opening");
ok((await page.locator(".week-heading").count()) >= 1, "openings are grouped by week");
ok((await card.locator(".spots").textContent()) === "3 of 3 spots left", "spots left shown: " + (await card.locator(".spots").textContent()));
ok((await card.locator(".opening-notes strong").count()) === 1, "notes render as Markdown");
ok((await card.locator(".badge", { hasText: "Newton" }).count()) === 1, "neighbourhood badge on the card");

await page.selectOption("#filter-neighbourhood", "Newton");
ok((await card.count()) === 1, "neighbourhood filter keeps a Newton opening");
await page.selectOption("#filter-task", task.id);
ok((await card.count()) === 1, "task filter keeps a door-knocking opening");
await page.selectOption("#filter-neighbourhood", "all");
await page.selectOption("#filter-task", "all");

await card.locator("button", { hasText: "Sign up" }).click();
await card.locator('input[name="name"]').fill("Harjit Gill");
await card.locator('input[name="email"]').fill("harjit@example.com");
await card.locator('input[name="phone"]').fill("604-555-0199");
await card.locator('input[name="postalCode"]').fill("v3w 2a1");
await card.locator('input[name="consent"]').check();
await card.locator('input[name="smsConsent"]').check();
await card.locator("button[type=submit]").click();
await card.locator(".opening-confirm").waitFor();
const confirmation = await card.locator(".opening-confirm").textContent();
ok(confirmation.includes("You're signed up") && confirmation.includes("E2E Door-knocking in Newton"), "confirmation shows in place");
ok((await card.locator(".opening-confirm").evaluate((el) => el === document.activeElement)) === true, "focus moves to the confirmation");
ok((await card.locator('.calendar-link[href*="calendar.google.com"]').count()) === 1, "Google Calendar link on the confirmation");
const icsHref = await card.locator(".calendar-link[download]").getAttribute("href");
ok(icsHref.endsWith(`/volunteer/openings/${opening.id}.ics`), ".ics link on the confirmation: " + icsHref);
ok(await card.locator(".share-button").first().evaluate((el) => el.classList.contains("share-button--whatsapp") && el.textContent.startsWith("WhatsApp")), "share buttons with WhatsApp first");
ok((await card.locator(".share-button--copy").count()) === 1, "copy-link button");
ok((await card.locator(".spots").textContent()) === "2 of 3 spots left", "spots left drop in place");

const person = (await sql`select first_name, last_name, phone, postal_code, neighbourhood, interest_volunteer, contact_consent_at, sms_consent_at, source, referral_code from people where email = 'harjit@example.com'`)[0];
ok(
  person && person.first_name === "Harjit" && person.last_name === "Gill" && person.postal_code === "V3W 2A1" && person.neighbourhood === "Newton" && person.interest_volunteer && person.contact_consent_at && person.sms_consent_at,
  "person created with consent, phone, postal code and neighbourhood",
);
ok(person?.source === "volunteer:e2e-whatsapp", "source from the page URL recorded: " + person?.source);
ok(/^[A-Z0-9]{6,12}$/.test(person?.referral_code ?? ""), "signer gets a referral code for sharing");
const shift = (await sql`select s.status, s.slot, s.opening_id, t.name as task from shifts s left join volunteer_tasks t on t.id = s.task_id join people p on p.id = s.person_id where p.email = 'harjit@example.com'`)[0];
ok(shift && shift.status === "scheduled" && shift.opening_id === opening.id && shift.slot === "morning" && shift.task === "Door-knocking", "shift row points at the opening with its task");

await page.goto(BASE + "/volunteer");
ok((await page.locator(".opening-card", { hasText: "E2E Door-knocking" }).locator(".spots").textContent()) === "2 of 3 spots left", "spots left decrease after reload");

const again = page.locator(".opening-card", { hasText: "E2E Door-knocking in Newton" });
await again.locator("button", { hasText: "Sign up" }).click();
await again.locator('input[name="name"]').fill("Harjit Gill");
await again.locator('input[name="email"]').fill("HARJIT@example.com");
await again.locator('input[name="postalCode"]').fill("V3W 2A1");
await again.locator('input[name="consent"]').check();
await again.locator("button[type=submit]").click();
await again.locator("[role=alert]").waitFor();
ok((await again.locator("[role=alert]").textContent()).includes("already signed up"), "duplicate sign-up shows the friendly message");
ok((await sql`select count(*)::int c from shifts where opening_id = ${opening.id}`)[0].c === 1, "duplicate did not add a shift");

let r = await post("/api/volunteer/signup", { openingId: opening.id, name: "Harjit Gill", email: "harjit@example.com", postalCode: "V3W 2A1", consent: true });
ok(r.status === 409, "duplicate sign-up is a 409 from the API");
r = await post("/api/volunteer/signup", { openingId: opening.id, name: "Nina", email: "nina@example.com", postalCode: "V3W 2A1", consent: false });
ok(r.status === 422 && r.body.fields?.consent, "consent is required");
r = await post("/api/volunteer/signup", { openingId: opening.id, name: "Nina", email: "nina@example.com", postalCode: "V3W 2A1", consent: true, smsConsent: true });
ok(r.status === 422 && r.body.fields?.phone, "text reminders need a phone number");
r = await post("/api/volunteer/signup", { openingId: opening.id, name: "Bot", email: "bot@example.com", postalCode: "V3W 2A1", consent: true, website: "spam.com" });
ok(r.status === 200 && (await sql`select count(*)::int c from people where email = 'bot@example.com'`)[0].c === 0, "honeypot submission dropped silently");
for (const n of [2, 3]) {
  r = await post("/api/volunteer/signup", { openingId: opening.id, name: `Vol ${n}`, email: `vol${n}@example.com`, postalCode: "V3T 1V8", consent: true });
  ok(r.status === 200 && r.body.confirmation?.spotsLeft === 3 - n, `sign-up ${n} accepted, ${3 - n} left`);
}
r = await post("/api/volunteer/signup", { openingId: opening.id, name: "Vol 4", email: "vol4@example.com", postalCode: "V3T 1V8", consent: true });
ok(r.status === 409 && /filled up/.test(r.body.error ?? ""), "a full opening refuses the next sign-up with 409");
r = await post("/api/volunteer/signup", { openingId: "5b1d3a0e-0f4c-4d3b-9c3a-1f2e3d4c5b6a", name: "Vol 5", email: "vol5@example.com", postalCode: "V3T 1V8", consent: true });
ok(r.status === 404, "unknown opening is a 404");
await page.goto(BASE + "/volunteer");
ok((await page.locator(".opening-card", { hasText: "E2E Door-knocking" }).locator(".spots").textContent()) === "Full", "a full opening says so");

const ics = await fetch(`${BASE}/volunteer/openings/${opening.id}.ics`);
const icsText = await ics.text();
ok(ics.status === 200 && (ics.headers.get("content-type") ?? "").startsWith("text/calendar"), ".ics route is text/calendar");
ok(icsText.includes("E2E Door-knocking in Newton") && icsText.includes("BEGIN:VEVENT") && !/harjit/i.test(icsText), ".ics has the title and no personal data");
ok((await fetch(`${BASE}/volunteer/openings/not-a-uuid.ics`)).status === 404, "bad .ics id is a 404");

await page.goto(BASE + "/neighbourhoods/newton");
let text = await page.evaluate(() => document.body.textContent);
ok(text.includes("E2E Door-knocking in Newton"), "/neighbourhoods/newton shows the opening");
ok(text.includes("E2E Newton neighbourhood social"), "/neighbourhoods/newton shows the Newton event");
ok(text.includes("City-wide events") && text.includes("E2E Tiny town hall"), "city-wide events listed separately");
ok((await page.locator('a[href="/#join?neighbourhood=Newton"]').count()) >= 1, "join CTA carries the neighbourhood");
ok(text.includes("Be one of the first"), "counters under five say be one of the first");
ok(await page.locator(".share-button").first().evaluate((el) => el.classList.contains("share-button--whatsapp")), "neighbourhood page has share buttons, WhatsApp first");
ok((await fetch(`${BASE}/neighbourhoods/langley`)).status === 404, "unknown neighbourhood is a 404");

await page.goto(BASE + "/neighbourhoods");
await page.fill("#lookup-postal", "V3T 1V8");
await page.click('button:has-text("Find it")');
await page.waitForURL(/\/neighbourhoods\/whalley$/);
ok(page.url().endsWith("/neighbourhoods/whalley"), "postal lookup navigates to Whalley");
await page.goto(BASE + "/neighbourhoods");
await page.fill("#lookup-postal", "V6B 1A1");
await page.click('button:has-text("Find it")');
await page.locator(".alert").waitFor();
ok((await page.locator(".alert").textContent()).includes("Join as a member") && (await page.locator('.alert a[href="/#join"]').count()) === 1, "unknown postal code offers the join form");

await page.goto(BASE + "/events/e2e-tiny-townhall");
text = await page.evaluate(() => document.body.textContent);
ok(text.includes("1 of 1 spots left") && text.includes("City-wide"), "event page shows spots left and the city-wide badge");
ok((await page.locator('a[href*="google.com/maps"]').count()) === 1, "address links to a map");
ok((await page.locator('.calendar-link[href="/events/e2e-tiny-townhall/calendar.ics"]').count()) === 1, "event page has the .ics link");
ok((await page.locator(".share-button").count()) === 6, "event page has six share buttons");
const evIcs = await fetch(`${BASE}/events/e2e-tiny-townhall/calendar.ics`);
ok(evIcs.status === 200 && (evIcs.headers.get("content-type") ?? "").startsWith("text/calendar") && (await evIcs.text()).includes("E2E Tiny town hall"), "event .ics route");
await page.goto(BASE + "/events");
ok((await page.locator(".event-feature", { hasText: "E2E Newton neighbourhood social" }).locator(".badge", { hasText: "Newton" }).count()) === 1, "events list shows the neighbourhood badge");

r = await post("/api/events/e2e-tiny-townhall/rsvp", { name: "First Person", email: "first@example.com", source: "e2e-share", ref: "" });
ok(r.status === 200, "first RSVP accepted");
ok((await sql`select source from event_rsvps where email = 'first@example.com'`)[0]?.source === "e2e-share", "RSVP stores its source");
r = await post("/api/events/e2e-tiny-townhall/rsvp", { name: "Second Person", email: "second@example.com" });
ok(r.status === 409 && /full/i.test(r.body.error ?? ""), "an event with capacity 1 refuses a second RSVP with 409");
r = await post("/api/events/e2e-tiny-townhall/rsvp", { name: "First Person", email: "first@example.com", guests: 1 });
ok(r.status === 409, "bringing a guest past capacity is refused too");
r = await post("/api/events/e2e-tiny-townhall/rsvp", { name: "First Person", email: "first@example.com", guests: 0 });
ok(r.status === 200, "changing your own RSVP still works");
await page.goto(BASE + "/events/e2e-tiny-townhall");
text = await page.evaluate(() => document.body.textContent);
ok(text.includes("This event is full"), "event page shows it is full after the RSVP");

const mobile = await browser.newPage({ viewport: { width: 360, height: 800 } });
for (const path of ["/volunteer", "/neighbourhoods", "/neighbourhoods/newton", "/events/e2e-tiny-townhall"]) {
  await mobile.goto(BASE + path);
  const layout = await mobile.evaluate(() => {
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > 360.5) wide.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")}@${Math.round(r.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, wide: wide.slice(0, 5) };
  });
  ok(layout.scrollWidth <= 360, `${path} has no sideways scroll at 360px${layout.scrollWidth > 360 ? ` (${layout.scrollWidth}px: ${layout.wide.join(", ")})` : ""}`);
}

await browser.close();
await finish();
