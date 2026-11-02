// The public promise tracker and its admin scoring flow, in a real browser.
import { chromium } from "playwright";
import { BASE, sql, ok, finish, adminLogin } from "./helpers.mjs";

await sql`delete from tracker_updates`;
await sql`update tracker_promises set status = 'not_started', status_changed_at = null`;
await sql`delete from tracker_announcements where title = 'Inaugural council meeting'`;
const promiseCount = (await sql`select count(*)::int c from tracker_promises`)[0].c;
const recreation = (await sql`select count(*)::int c from tracker_promises where area = 'Recreation'`)[0].c;
const announcementCount = (await sql`select count(*)::int c from tracker_announcements`)[0].c;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE + "/tracker");
ok((await page.locator(".promise-card").count()) === promiseCount, `${promiseCount} promises listed`);
ok((await page.locator(".score-legend").textContent()).includes(String(promiseCount)), "scoreboard shows the total tracked");
ok((await page.locator(".announcements > li").count()) === announcementCount, `${announcementCount} announcements`);
ok((await page.locator(".timeline-row").count()) === 8, "8 key dates on the timeline");
ok((await page.locator(".key-next").count()) === 1, "a next key date is shown");

await page.selectOption("#tracker-area", "Recreation");
ok((await page.locator(".promise-card").count()) === recreation, `area filter: ${recreation} recreation promises`);
await page.selectOption("#tracker-area", "all");
await page.fill("#tracker-search", "hospital");
ok((await page.locator(".promise-card").count()) >= 1 && (await page.locator(".promise-card").first().textContent()).includes("Hospital"), "search finds the hospital promise");
await page.fill("#tracker-search", "");

await page.locator("#promise-10 .promise-toggle").click();
const detail = await page.locator("#promise-10 .promise-detail").textContent();
ok(detail.includes("early February 2027") && detail.includes("Cloke profile"), "promise 10 shows its delivery test and sources");

await adminLogin(page);
await page.goto(BASE + "/admin/tracker");
const card = page.locator("details.card", { hasText: "Police helicopter and drone fleet" });
await card.locator("summary").first().click();
await card.locator("select[name=status]").first().selectOption("in_progress");
await card.locator("textarea[name=note]").fill("Police Board approves a helicopter lease in the provisional budget.");
await card.locator("input[name=url]").fill("https://example.org/police-board-minutes");
await card.locator('button:has-text("Add update")').click();
await page.waitForLoadState("networkidle");

await page.fill("#na-title", "Inaugural council meeting");
await page.fill("#na-commitments", "Council strikes a forensic audit committee.");
await page.fill("#na-src", "Surrey Now-Leader, Nov 3, 2026");
await page.fill("#na-url", "https://example.org/inaugural");
await page.click('button:has-text("Add announcement")');
await page.waitForLoadState("networkidle");

await page.goto(BASE + "/tracker#promise-10");
await page.waitForTimeout(500);
const c10 = await page.locator("#promise-10").textContent();
ok(c10.includes("In progress") && c10.includes("Police Board approves"), "admin update shows publicly with new status, auto-opened from link");
ok((await page.locator('#promise-10 a[href="https://example.org/police-board-minutes"]').count()) === 1, "update links to the record");
ok(/1\s*In progress/.test(await page.locator(".score-legend").textContent()), "scoreboard counts the change");
ok((await page.locator(".announcements > li").first().textContent()).includes("Inaugural council meeting"), "new announcement at the top of the log");
const top = await page.locator("#promise-10").evaluate((e) => e.getBoundingClientRect().top);
const headerBottom = await page.locator(".site-header").evaluate((e) => e.getBoundingClientRect().bottom);
ok(top >= headerBottom, "a linked promise scrolls clear of the sticky header");

const mobile = await browser.newPage({ viewport: { width: 375, height: 800 } });
await mobile.goto(BASE + "/tracker");
ok((await mobile.evaluate(() => document.documentElement.scrollWidth)) <= 375, "tracker has no sideways scroll on a phone");

await page.goto(BASE + "/");
ok((await page.locator('header a[href="/tracker"]').count()) === 1, "nav links to the tracker");
for (const w of [1440, 1280, 1200]) {
  const p = await browser.newPage({ viewport: { width: w, height: 800 } });
  await p.goto(BASE + "/");
  const h = await p.locator(".site-header").evaluate((e) => e.getBoundingClientRect().height);
  ok(h < 110, `header stays on one line at ${w}px (${Math.round(h)}px tall)`);
  await p.close();
}

await browser.close();
await finish();
