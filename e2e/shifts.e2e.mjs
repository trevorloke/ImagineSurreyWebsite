// The volunteer shift calendar, driven in a real browser: dragging names onto
// shifts, recolouring by task, moving and removing shifts, tap mode, copying a
// week, and the CSV export.
import { chromium } from "playwright";
import { BASE, sql, ok, finish, adminLogin } from "./helpers.mjs";

await sql`insert into people (email, first_name, last_name, phone, neighbourhood, interest_volunteer) values
  ('priya@example.com','Priya','Sandhu','604-555-0101','Newton',true),
  ('marco@example.com','Marco','Reyes','604-555-0102','Whalley',true),
  ('li@example.com','Li','Chen',null,'Fleetwood',true),
  ('dana@example.com','Dana','Okafor','604-555-0104','Cloverdale',true),
  ('notvol@example.com','Sam','Bishop',null,'Guildford',false)
  on conflict (email) do update set interest_volunteer = excluded.interest_volunteer`;
await sql`delete from shifts`;
await sql`delete from volunteer_tasks where name = 'Canvassing training'`;
const volunteers = (await sql`select count(*)::int c from people where interest_volunteer`)[0].c;

const taskOf = async (first) => (await sql`select t.name from shifts s join volunteer_tasks t on t.id = s.task_id join people p on p.id = s.person_id where p.first_name = ${first}`)[0]?.name;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("dialog", (d) => d.accept());
await adminLogin(page);
await page.goto(BASE + "/admin/shifts");

ok((await page.locator(".shift-day").count()) === 7, "seven day columns, Sunday first: " + (await page.locator(".shift-weekday").first().textContent()));
ok((await page.locator(".roster-name").count()) === volunteers, `roster lists the ${volunteers} volunteers, not non-volunteers`);
const cell = (day, slot) => page.locator(".shift-cell").nth(slot * 7 + day);

await page.locator(".roster-name", { hasText: "Priya" }).dragTo(cell(1, 0));
await page.waitForTimeout(400);
ok((await cell(1, 0).locator(".shift-chip", { hasText: "Priya" }).count()) === 1, "drag name onto Monday morning");
ok((await taskOf("Priya")) === "Door-knocking", "saved with the selected task");
const bg = await cell(1, 0).locator(".shift-chip").evaluate((e) => getComputedStyle(e).backgroundColor);
ok(bg === "rgb(0, 57, 121)", "chip is navy for Door-knocking: " + bg);

await page.locator(".task-pill", { hasText: "Phone bank" }).click();
await page.locator(".roster-name", { hasText: "Marco" }).dragTo(cell(2, 2));
await page.waitForTimeout(400);
const marco = (await sql`select t.name || ' ' || s.slot as v from shifts s join volunteer_tasks t on t.id = s.task_id join people p on p.id = s.person_id where p.first_name = 'Marco'`)[0]?.v;
ok(marco === "Phone bank evening", "second brush colour applied");

await page.locator(".task-pill", { hasText: "Events" }).dragTo(cell(1, 0).locator(".shift-chip"));
await page.waitForTimeout(400);
ok((await taskOf("Priya")) === "Events", "drag colour onto a shift recolours it");

await cell(1, 0).locator(".shift-chip").dragTo(cell(3, 1));
await page.waitForTimeout(400);
const moved = (await sql`select extract(dow from date)::int || ' ' || slot as v from shifts s join people p on p.id = s.person_id where p.first_name = 'Priya'`)[0]?.v;
ok(moved === "3 afternoon", "drag shift moves it to another day and time");

await page.locator(".roster-name", { hasText: "Priya" }).dragTo(cell(3, 1));
await page.waitForTimeout(300);
ok((await page.locator("[role=status].alert").textContent()).includes("already on that shift"), "double-booking the same slot is refused");

await page.locator(".roster-name", { hasText: "Li Chen" }).click();
await cell(6, 0).locator(".shift-add").click();
await page.waitForTimeout(400);
ok((await cell(6, 0).locator(".shift-chip", { hasText: "Li" }).count()) === 1, "tap a name then a slot (phone-friendly)");
await page.keyboard.press("Escape");

await cell(6, 0).locator(".shift-chip").click();
await page.locator(".shift-menu-item", { hasText: "Office" }).click();
await page.waitForTimeout(400);
ok((await taskOf("Li")) === "Office", "click a shift to pick its task from a menu");
ok((await page.locator(".roster-name", { hasText: "Marco" }).locator(".roster-count").textContent()) === "1", "roster shows shift count");

await cell(2, 2).locator(".shift-chip").dragTo(page.locator(".roster-drop-hint"));
await page.waitForTimeout(400);
ok((await sql`select count(*)::int c from shifts s join people p on p.id = s.person_id where p.first_name = 'Marco'`)[0].c === 0, "drag shift back to the list removes it");

await page.fill(".roster input[type=search]", "Bish");
await page.locator(".roster-name", { hasText: "Sam Bishop" }).waitFor();
await page.locator(".roster-name", { hasText: "Sam Bishop" }).dragTo(cell(0, 2));
await page.waitForTimeout(400);
ok((await sql`select count(*)::int c from shifts s join people p on p.id = s.person_id where p.first_name = 'Sam'`)[0].c === 1, "search finds non-volunteers and they can be dragged in");
ok((await cell(0, 2).locator(".shift-chip", { hasText: "Sam Bishop" }).count()) === 1, "dragged-in non-volunteer shows by name right away");

await page.click("text=+ New task");
await page.fill("#task-name", "Canvassing training");
await page.locator(".color-choice").nth(6).click();
await page.click('button:has-text("Add task")');
await page.waitForTimeout(400);
ok((await sql`select color from volunteer_tasks where name = 'Canvassing training'`)[0]?.color === "#0E9AA7", "new task created with chosen colour");
ok((await page.locator(".task-pill[aria-checked=true]", { hasText: "Canvassing" }).count()) === 1, "new task becomes the active colour");

await page.click('a[aria-label="Next week"]');
await page.waitForURL(/week=/);
await page.click("text=Copy last week");
await page.waitForTimeout(1200);
ok((await page.locator(".shift-chip").count()) === 3, "copy last week repeats the 3 shifts");
await page.reload();
ok((await page.locator(".shift-chip").count()) === 3, "shifts persist after reload");

const anon = await (await fetch(BASE + "/api/admin/shifts", { method: "POST", body: "{}" })).status;
ok(anon === 401, "shift API requires admin sign-in");
const csv = await page.evaluate(async () => (await fetch("/api/admin/export/shifts")).text());
ok(csv.startsWith("date,slot,volunteer") && csv.includes("Priya Sandhu") && csv.includes("Office"), "shifts CSV export");

const mobile = await browser.newPage({ viewport: { width: 390, height: 900 } });
await mobile.context().addCookies(await page.context().cookies());
await mobile.goto(BASE + "/admin/shifts");
ok((await mobile.evaluate(() => document.documentElement.scrollWidth)) <= 390, "shift board has no sideways scroll on a phone");

await browser.close();
await finish();
