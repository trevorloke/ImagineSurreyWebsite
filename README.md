# Imagine Surrey website

The public website and organizing back office for Imagine Surrey: Next.js 16 (App Router, React 19, TypeScript), PostgreSQL through Drizzle ORM, Stripe Checkout, Resend email, Twilio texts and Supabase Storage.

**Going live?** Follow [SETUP.md](SETUP.md). **Working on the code?** Read [CONTRIBUTING.md](CONTRIBUTING.md).

## What the public sees

| Page | What it does |
| --- | --- |
| **Home** (`/`) | Every word comes from Admin → Site settings. Under the hero, an "Act now" rail shows live numbers (members, pledge and petition signers), the next events and the next open volunteer shift, and the latest promise-tracker changes. A "Your area" chip turns a postal code into the visitor's town centre and shows local numbers. The postal code never leaves the browser. |
| **Join** (`/#join`) | Membership through Stripe Checkout. The fee counts as a contribution under BC law. Separate, unticked boxes for email updates and texts. |
| **Donate** (`/donate`) | One-time or monthly gifts, never pre-selected as monthly, to the council or school board slate (or both). The BC annual contribution limit is enforced across every channel, and any excess is refunded automatically. |
| **Petitions and pledges** (`/act`, `/act/<slug>`) | Created in Admin → Content → Campaigns. Each has a milestone bar, counts by town centre (shown only once a town centre has at least 10), a share image, a WhatsApp-first share row and a printable paper sheet (`/act/<slug>/print`). |
| **Promise tracker** (`/tracker`) | Safe Surrey Coalition's 26 promises. Each has its own page (`/tracker/<n>`) showing the record, the delivery test, a due or overdue countdown, a follow form for email alerts, a share image and a letter to council. There is also a methodology page, an RSS feed, a JSON API (`/api/promises`) and an embeddable scoreboard (`/tracker/embed`). |
| **Volunteer** (`/volunteer`) | Published shift openings by week, with spots left. One-tap sign-up adds the shift to your calendar (`.ics` or Google) and sends reminders the day before. |
| **Neighbourhoods** (`/neighbourhoods/<town-centre>`) | Each of the six town centres has a page: events, open shifts, the promises that touch it and local counts. A postal-code finder sends people to their own. |
| **Events** (`/events`) | Capacity, a map link, calendar files, RSVPs (refused once the event is full) and share links. |
| **Numbers** (`/stats`) | Live counts with a published "how we count" method, refreshed every five minutes. |
| **Supporter portal** (`/me`) | Passwordless sign-in by emailed link. Shows membership, giving this year with the room left under the BC limit, managing a monthly gift (Stripe), upcoming shifts and RSVPs with a calendar feed, a personal referral link, preferences (language, email, texts) and "download my data" or "delete my account". |
| **Email preferences** (`/preferences`) | Anyone can ask for a link by email and change what they receive, with no account needed. |
| **Shop**, **News**, `/privacy`, `/accessibility` and any page made in Admin → Pages | |

Every action ends with one next step and a share link that carries the supporter's referral code (`/r/<code>`). A visit with `?ref=` or `?source=` is remembered for 30 days, so a later sign-up is credited to whoever shared it.

## What organizers use (`/admin`)

Staff sign in with email and password, or a one-time emailed link. Owners invite staff at Admin → Staff. Each role (owner, admin, organizer, editor) sees only what it needs, and money data needs the `money` permission. Every change is in the audit log.

| Area | What it does |
| --- | --- |
| **Dashboard** | Active members, monthly donors, money raised this year net of refunds, subscribers, signatures, volunteers this week and orders to ship, with 12-week trends and a "needs attention" list. |
| **Supporters** | Search and filter everyone (membership, town centre, interests, tags, source, newsletter, texts, language). Each person has a timeline, tags, notes, a read-only consent panel and referrals. Bulk-tag a filtered list, export it as CSV, and anonymize a person when they ask to be deleted (BC PIPA). **Sources** shows which links, shares and referrers bring people in. |
| **Volunteer shifts** | A Sunday–Saturday calendar of 9–12, 1–4 and 5–8 shifts. Drag a name onto a shift and colour-code the task. Every drag also works from the keyboard and by tapping. An openings panel publishes shifts people can sign up for, with capacity and a list of who signed up. |
| **Email and texts** | The log of every email and text the website sent and every text it received. Newsletters, campaign emails and text blasts go out from Starbase, which has the full list; the website sends only transactional messages (confirmations, receipts, reminders, promise-tracker alerts, sign-in links) and handles STOP and START on its own number. |
| **Content** | News (with drafts and scheduled posts), events (with RSVP check-in and walk-ins), shop products and campaigns. **Pages** makes free-form pages, **Media** is the image library, and **Site settings** edits every section of copy on the public pages. |
| **Promise tracker** | Score promises with dated, sourced updates. Followers are emailed when a status changes. |
| **Integrations** | What's connected (Stripe, email, texts, storage, Starbase, the human check, analytics, cron, database), with test buttons. |
| **Gifts to log at the desk** | Online gifts the treasurer still has to enter in Starbase (Donations → Log a gift), with a CSV and "Mark logged". |
| **Exports**, **Staff**, **Audit log**, **My account** | |

## Starbase (the desk)

The campaign's database app, Starbase, gets new sign-ups from this website: petition and pledge signatures, confirmed newsletter sign-ups, volunteer shift sign-ups, memberships once they are active, "delete my account" requests, and details supporters change in the portal. RSVPs, paid shop orders and promise follows go as tags on the person (`RSVP: <event>`, `Bought merch`, `Follows: promise <n>`). Every unsubscribe and text STOP goes to Starbase too, and Starbase can send its own to `POST /api/in/consent` (`STARBASE_INBOUND_KEY`), so neither app contacts someone who said stop. The website calls Starbase's API from its own server with a secret key (`STARBASE_URL`, `STARBASE_KEY`), through an outbox that retries, so Starbase being down never breaks a form. Money is never sent: the treasurer logs each online gift at the desk from Admin → Gifts to log at the desk, because that is where contribution limits are checked. Public forms also have a Cloudflare Turnstile human check. See [SETUP.md](SETUP.md) steps 9f and 9g.

## Consent and privacy, by design

- **Consent ledger.** Every grant and withdrawal of email or text consent is stored in `consent_events` with the exact wording the person saw, where it happened, and when. This is proof of consent for CASL.
- **Tick boxes are never pre-checked.** A public form can't undo someone's withdrawal: anyone can type anyone's email, so only a verified channel (the preference centre link, the signed-in portal, a text from the number itself) can re-grant consent.
- **Newsletter sign-up is double opt-in** when email is configured. An address that unsubscribed is never re-added by a form.
- **No public answer reveals whether an email belongs to a member, donor or signer** (political affiliation is sensitive under BC PIPA). Public counts are shown only from 10 upward.

## Local development

```sh
cp .env.example .env.local      # then fill it in
npm install
npm run db:migrate              # create the tables
npm run db:seed                 # shop, volunteer tasks, promise tracker, campaigns, sample openings, draft pages
npm run dev                     # http://localhost:3000
```

To change the schema, edit `src/lib/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`. Every table must have row-level security turned on.

### Looking around the admin locally

Set `ADMIN_PREVIEW_MODE=1` in `.env.local` and open `http://localhost:3000/admin`: you're signed in as an owner automatically, with a yellow banner saying so. It only works when `DATABASE_URL` points at a database on the same machine, and never on Vercel or Render, so the live site always needs a real sign-in.

## Tests

```sh
npm run typecheck
npm test                                    # unit tests; set TEST_DATABASE_URL=<a *_test database> to include database tests
ADMIN_EMAIL=admin@example.com npm run e2e   # builds the site and runs every end-to-end suite against a scratch database
ADMIN_EMAIL=admin@example.com npm run e2e -- portal forms   # selected suites
```

The end-to-end runner wipes the database in `E2E_DATABASE_URL`, and refuses unless the name ends in `_e2e` or `_test`. It starts a fake services server (Stripe, Starbase and Turnstile's check), gives each suite a clean staff table and refreshed page caches, and runs these suites: api, shifts, tracker, admin, volunteer, portal, forms, comms, content, shell and desk. The desk suite also starts a second server, with the human check on, on `E2E_PORT + 1`.

## Before launch: decisions for the organization

- **Membership fee**: `MEMBERSHIP_FEE_CENTS` defaults to $10 a year. Set it to `0` for free membership.
- **Contribution limit**: `CONTRIBUTION_LIMIT_CENTS` is $1,429.70. Check it against Elections BC every January.
- **Over-limit membership fees**: everyone with a fee goes to checkout, so the site never reveals that someone is near the limit. A fee that turns out to be over the limit is refunded automatically, and the membership is cancelled with a private email to the payer. Each refund costs the Stripe fee.
- **Privacy policy**: the seeded `/privacy` page is a **draft**. Have the board and privacy officer review it before launch.
- **Public counters**: decide whether the board will keep showing live numbers when they fall. `/stats` publishes the counting method.
- **Election-law review**: have your financial agent confirm the contributor fields, the disclosure exports and the treatment of merchandise. Under the LECFA, any amount paid over a merch item's market value can count as a contribution.
- **Shipping**: shop checkout collects an address but charges nothing for shipping.

The form rate limiter runs in memory on each server instance. On serverless hosting, add a WAF or a shared limiter if spam becomes a problem.
