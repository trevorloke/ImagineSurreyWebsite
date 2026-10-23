# Imagine Surrey website

The Imagine Surrey home page design, built as a working site: Next.js (App Router, TypeScript), PostgreSQL through Drizzle ORM, and Stripe Checkout.

## What's connected

| Feature | Where the data goes |
| --- | --- |
| **Membership** (home page form) | `people`, `memberships`. The fee is paid through Stripe Checkout and recorded in `contributions`, because membership fees count as contributions under BC law. Members under 14 are refused, and so are fee payers who aren't citizens or permanent residents. Members who live outside Surrey can join, but they're flagged as non-voting. |
| **Donations** (`/donate`, and the "Chip in" card on the home page) | One-time gifts use Stripe Checkout payments. Monthly gifts use Stripe subscriptions, and each monthly payment is recorded from `invoice.paid`. A Superstar gift is two contributions, one per slate, paid in one payment. |
| **BC contribution limit** | Checked before checkout. The check counts this year's gifts, any open checkouts, and payments still to come from monthly gifts. The webhook checks again after every payment and refunds any amount over the limit automatically. |
| **Newsletter** | `newsletter_subscribers`, each with an unsubscribe token (`/newsletter/unsubscribe?token=…`). Members, donors and petition signers who agree to be contacted are subscribed too. |
| **Pledge and SkyTrain petition** | `campaign_signatures` |
| **Events and RSVPs** | `events`, `event_rsvps` |
| **Shop** | `products`, `orders`, `order_items`. Checkout through Stripe, with a Canadian shipping address. |
| **Promise tracker** (`/tracker`) | `tracker_promises`, `tracker_updates`, `tracker_announcements`. Safe Surrey Coalition's 26 campaign promises, each with sources, a status and a delivery test (what counts as kept, partly kept or broken). The page also has a timeline of key dates and the announcements log. Visitors can filter by status and area, search, and link to a single promise (`/tracker#promise-10`). Score promises in `/admin/tracker`: add a dated update with a link to the record, and the status, scoreboard and public page change together. You can also add promises and announcements there. |
| **Volunteer shifts** (`/admin/shifts`) | `shifts`, `volunteer_tasks`. A Sunday–Saturday calendar with Morning, Afternoon and Evening rows. Pick a task colour, then drag a volunteer's name onto a shift. You can also drag shifts to move them, drag a colour onto a shift to change its task, or drag a shift back to the list to remove it. On phones, tap a name and then a shift. "Copy last week" repeats a schedule, and "Print" gives a clean sheet for the wall. The list shows everyone who ticked "Volunteering", and search finds anyone else. |
| **Admin** (`/admin`) | Totals; tables of members, contributions, monthly donors, subscribers, signatures, RSVPs and orders, each downloadable as CSV; publishing news and events; shop prices. |

Every person is stored once in `people`, keyed by email, so one supporter's membership, donations, signatures and RSVPs line up.

## Setup

```sh
cp .env.example .env.local      # then fill it in
npm install
npm run db:migrate              # create the tables
npm run db:seed                 # add shop products, volunteer tasks and the promise tracker
npm run dev                     # http://localhost:3000
```

### Database
Any PostgreSQL 14+ works, for example Neon, Supabase, RDS or Render. Put its connection string in `DATABASE_URL`. To change the schema, edit `src/lib/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`.

### Stripe
1. Put the secret key in `STRIPE_SECRET_KEY`. Use `sk_test_…` until launch.
2. Add a webhook endpoint at `https://YOUR-DOMAIN/api/stripe/webhook` that listens for:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. For local testing, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the `whsec_…` it prints.
4. In the Stripe dashboard, turn on email receipts. Optionally, turn on the customer portal so monthly donors can cancel on their own.

### Deploy
Vercel works with no extra configuration: import the repo and add the variables from `.env.example`. Any Node 20+ host works with `npm run build && npm start`.

## Tests

```sh
npm test            # contribution-limit rules, validation, CSV export
npm run typecheck
```

## Before launch: decisions for the organization

- **Membership fee**: `MEMBERSHIP_FEE_CENTS` defaults to $10 a year. Set it to `0` for free membership.
- **Contribution limit**: `CONTRIBUTION_LIMIT_CENTS` is $1,429.70, the figure from the design. Check it against Elections BC each year.
- **Content to fill in**: board names in `src/content/site.ts`, the privacy policy URL, and real news and events (add these in `/admin/content`).
- **Shipping**: shop checkout collects an address but charges no shipping. Add `shipping_options` in `src/lib/server/payments.ts` if you want to charge for it.
- **Election-law review**: have your financial agent confirm the contributor fields, the disclosure exports, and the treatment of merchandise. Under the LECFA, any amount paid over a merch item's market value can count as a contribution.
- **Not built yet**: address autocomplete (the street address field is styled for it, e.g. Canada Post AddressComplete), sending newsletters (export the list from `/admin`, or connect an email service), and social feed embeds.

The form rate limiter runs in memory on each server instance. On serverless hosting, add a WAF or a shared limiter if spam becomes a problem.
