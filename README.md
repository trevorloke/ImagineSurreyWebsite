# Imagine Surrey website

The Imagine Surrey home page design, built as a working site: Next.js (App Router, TypeScript) in front of **Starbase**, the campaign's own system. Starbase is the site's backend: every person, member, contribution, subscriber, signature, RSVP and order lives there, and so does the content the site shows. This site keeps no database.

## What's connected

| On the site | In Starbase |
| --- | --- |
| **Membership** (home page form) | `POST /api/public/<campaign>/join` → the person in People (tagged *member*, or *member-pending* until the fee is paid), on the newsletter list, and on the **Members** roll. The fee is a contribution under BC law: a pledge on Donations, paid through Stripe Checkout; the membership turns active when it's paid. Under 14 is refused; a fee is taken only from citizens and permanent residents in BC; outside Surrey can join but not vote. The fee is set under Website → Settings → Membership. |
| **Donations** (`/donate`, and the "Chip in" card) | `POST …/donate` → the same eligibility checks and annual-limit check as Starbase's own donate page, a pledge on Donations, Stripe Checkout back to `/donate/thanks`. Starbase's webhook books each payment as a gift, emails the receipt, flags anything over the limit, and mirrors refunds made in Stripe. One limit per contributor; the Superstar Club (two slates) isn't offered online. |
| **Newsletter** | `POST …/signup` (`kind: newsletter`) → the newsletter list in Outreach. Unsubscribe links in every email point at Starbase. |
| **Pledge and SkyTrain petition** | `POST …/signup` (`kind: petition`) → signatures on the petitions with those slugs (make them under Outreach → Petitions: `stop-mccallum-pledge`, `skytrain-south-surrey`). |
| **Events and RSVPs** | Events come from Starbase's Events (with the picture given under Website → Events); an RSVP posts `kind: rsvp`. |
| **News** | Website → News: Markdown, rendered by Starbase's safe renderer. |
| **Shop** | Website → Store: products, pictures, prices and stock. The cart posts to `POST …/site/store/checkout`; Starbase prices it, holds the items, opens Stripe Checkout back to `/shop/thanks`, and its webhook marks the order paid. |
| **Promise tracker** (`/tracker`) | Website → Promise tracker: the promises, their delivery tests, dated updates and announcements, read from `GET …/site/tracker`. The page's own copy (intro, highlights, key dates, source groups) stays in `src/content/tracker.ts`. |
| **Volunteer shifts** | Starbase's Shifts. |
| **Admin** | Starbase's admin (`/admin/`) and website admin (`/website-admin/`). |

## Setup

```sh
cp .env.example .env.local      # then fill it in
npm install
npm run dev                     # http://localhost:3000
```

| Setting | What it is |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | this site's public address, for the pages Stripe brings people back to |
| `STARBASE_URL` | where Starbase runs, e.g. `https://starbase.imaginesurrey.ca` |
| `STARBASE_WORKSPACE` | the campaign's slug in Starbase, e.g. `imagine-surrey` |
| `CONTRIBUTION_LIMIT_CENTS` | the annual limit the pages quote (Starbase checks the real one) |

On Starbase, put this site's origin in `STARBASE_SITE_ORIGINS` (e.g. `https://imaginesurrey.ca`) so Stripe may return here after a payment; Stripe's webhook endpoint is Starbase's (`/api/public/stripe/webhook`). Nothing else to set up: no database, no Stripe keys here.

### Deploy
Render, Vercel or any Node 20+ host: `npm run build && npm start` with the four settings above.

## Tests

```sh
npm test            # contribution rules, validation, the tracker's copy
npm run typecheck
```

## Before launch: decisions for the organization

- **Membership fee**: set under Starbase → Website → Settings → Membership (0 for free membership).
- **Contribution limit**: `CONTRIBUTION_LIMIT_CENTS` is $1,429.70, the figure from the design; Starbase's cap table has the same. Check it against Elections BC each year.
- **Content to fill in**: board names in `src/content/site.ts`, the privacy policy URL, and real news and events in Starbase.
- **Election-law review**: have your financial agent confirm the contributor fields, the disclosure exports (Starbase → Today → Export), and the treatment of merchandise.
- **Not built yet**: address autocomplete, and social feed embeds.
