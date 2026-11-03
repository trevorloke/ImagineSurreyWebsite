# Going live: database, website and payments

This guide takes the site from this repository to a live website. Supporter data goes into your Supabase database, the same one your Supabase app can use. Allow about an hour. You need accounts with Supabase, Vercel and Stripe, plus Node.js 20 or newer on your computer for step 4.

## 1. Prepare the Supabase database

1. **Open the Supabase project your app uses.** If you're creating a new project, choose the **Canada (Central)** region so supporter data stays in Canada.

2. **Check for clashing table names.** In **Table Editor**, look for any existing table with one of these names:

   `people`, `memberships`, `contributions`, `recurring_donations`, `newsletter_subscribers`, `campaign_signatures`, `news_posts`, `events`, `event_rsvps`, `products`, `orders`, `order_items`, `stripe_events`, `volunteer_tasks`, `shifts`, `tracker_promises`, `tracker_updates`, `tracker_announcements`

   If one already exists, stop here. The website's tables need to move into their own schema before going further.

3. **Copy two connection strings.** Click **Connect** at the top of the project:
   - **Transaction pooler** (port 6543): the live website uses this one.
   - **Session pooler** (port 5432): use this one to set up the tables.

   In both, replace `[YOUR-PASSWORD]` with your database password.

4. **Create the tables.** On your computer, run:

   ```sh
   git clone https://github.com/trevorloke/ImagineSurreyWebsite.git
   cd ImagineSurreyWebsite
   npm install
   DATABASE_URL="<session pooler string>" npm run db:migrate
   DATABASE_URL="<session pooler string>" npm run db:seed
   ```

   - **`db:migrate`** creates every table and turns on **row-level security** for each one. On Supabase, a table without row-level security can be read by anyone with the app's public API key. With it on, only the website's own database connection can reach these rows until you allow your app in (section 4). Tables that belong to your app are not touched.
   - **`db:seed`** loads the 26 tracked promises, the six shop products and the starter volunteer tasks. Running it again never overwrites changes made in `/admin`.

   After this first time, you don't need to repeat them: every **production** deploy on Vercel runs any new migrations and the seed before building (the `vercel-build` script; set `SKIP_DB_MIGRATE=1` to turn that off). If that step fails, the deploy stops and the current site stays live.

## 2. Put the website online with Vercel

5. **Import the repository.** In Vercel, choose **Add New → Project**, import `trevorloke/ImagineSurreyWebsite`, and keep the detected Next.js settings.

6. **Add these Environment Variables:**

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | The **transaction pooler** string (port 6543) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` for now |
   | `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key. Use `sk_test_…` while testing. |
   | `STRIPE_WEBHOOK_SECRET` | Leave blank for now; you fill it in at step 8 |
   | `MEMBERSHIP_FEE_CENTS` | e.g. `1000` for $10 a year, or `0` for free membership |
   | `CONTRIBUTION_LIMIT_CENTS` | `142970` ($1,429.70; check it against Elections BC each year) |
   | `ADMIN_EMAIL` | **Required to sign in to `/admin`.** Your email: the first sign-in with this address and `ADMIN_PASSWORD` creates the owner account |
   | `ADMIN_PASSWORD` | A long password (12+ characters) for that first sign-in. Change it afterwards under My account |
   | `ADMIN_SESSION_SECRET` | A long random string, e.g. from `openssl rand -hex 32`. It also signs supporter sign-ins |
   | `CRON_SECRET` | A long random string. Vercel sends it to the two daily jobs: day-before reminders (about 10 a.m. Pacific) and a sweep of any email still queued. These work on every Vercel plan |
   | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Email (step 9a). Optional at first: without them nothing is sent, but every message is still logged |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Texts (step 9b). Optional |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MEDIA_BUCKET` | Image uploads in Admin → Media (step 9c). Optional |
   | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` or `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Analytics, only if you want them |

7. **Click Deploy.**

8. **Connect Stripe's payment notices.** In Stripe → Developers → Webhooks, add the endpoint `https://<your-site>/api/stripe/webhook` and select these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `customer.subscription.deleted`
   - `charge.refunded`

   Set the endpoint's **API version** to the version the site's Stripe library is pinned to (`node_modules/stripe/esm/apiVersion.js`, currently `2026-09-30.endive`). Events then arrive in the shape the code expects. With an older version the site still copes, by fetching objects again, at the cost of an extra Stripe call per event. In Stripe → Settings → Billing → Customer portal, turn the portal on so monthly donors can change or cancel their gift from `/me`.

   Copy the endpoint's signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` in Vercel, then redeploy.

9. **Add your domain.** In Vercel → Settings → Domains, add `imaginesurrey.ca` and follow the DNS instructions. Then:
   - change `NEXT_PUBLIC_SITE_URL` to `https://imaginesurrey.ca`
   - change the Stripe webhook address to the new domain
   - redeploy

9a. **Email (Resend).** Create a Resend account, verify your sending domain (add the DNS records it shows, and set up DMARC), and put the API key in `RESEND_API_KEY`. With email on:
   - Newsletter sign-ups are double opt-in: people join only when they click the confirmation link, which is valid for 72 hours.
   - Supporters get receipts and next steps, RSVP and shift confirmations with calendar files, reminders the day before, sign-in links for `/me`, and promise-follow alerts.
   - Campaigns from Admin → Email and texts start sending the moment you press Send and keep going in the background. A daily job (`/api/cron/email`) sends anything left over. Each email carries the recipient's one-click unsubscribe link.

   Admin → Integrations has a "Send me a test email" button.

9b. **Texts (Twilio).** Put the account SID, auth token and sending number (or an `MG…` messaging service) in the three `TWILIO_` variables. In Twilio, set the number's "A message comes in" webhook to `https://<your-site>/api/sms/inbound` (POST).
   - The site verifies Twilio's signature, and it uses `NEXT_PUBLIC_SITE_URL` to do so, so that must match the public address exactly.
   - Replies of STOP, START, HELP, JOIN and PUNJABI, HINDI, CHINESE or TAGALOG are handled automatically and recorded in the consent ledger.
   - Canadian carriers need a verified toll-free number for volume texting. Allow a few weeks for verification.

9c. **Image uploads (Supabase Storage).** In Supabase → Storage, create a **public** bucket named `site-media`. Put the project URL in `SUPABASE_URL` and the service-role key in `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the browser). On Vercel, uploads fail without this, because the server's disk isn't kept.

9d. **Staff.** Sign in at `/admin/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then invite the rest of the team at Admin → Staff.
   - With email on, each person gets a one-time sign-in link. Without it, you're shown a one-time password once, to pass on securely.
   - Deactivating an account or resetting a password signs that person out everywhere.
   - Keep at least one owner you can reach.

9e. **Content.** Review the draft `/privacy` page in Admin → Pages: name your privacy officer and confirm the processors (Vercel, Supabase, Stripe, Resend, Twilio, analytics). Then fill in Admin → Site settings: the organization's address, the financial agent's authorization line, the board, and the social accounts. After any bulk change made directly in the database, POST to `/api/admin/revalidate` (signed in) to refresh the public pages, or simply wait up to an hour.

## 3. Test, then go live

10. **Test with Stripe's test card.** Join and donate using card `4242 4242 4242 4242`, any future expiry date and any CVC. Then confirm that:
    - rows appear in Supabase in `memberships`, `contributions` and `newsletter_subscribers`
    - the same records show in `/admin`

11. **Switch to live payments.**
    - Replace the test key with the live secret key (`sk_live_…`).
    - In Stripe's live mode, create the same webhook endpoint and copy its new signing secret into `STRIPE_WEBHOOK_SECRET`.
    - Redeploy.

## 4. Let your Supabase app use the data

Your app and the website share one database, so your app can query the website's tables directly with `supabase-js`. Row-level security blocks every request until you add a policy saying who may see what.

To mark a staff user, set `app_metadata.role` to `"staff"` on their account. Use your app's server-side admin code or the SQL editor, never the browser. Then add a policy for each table your app needs. For example, to let staff read supporters and edit the shift calendar:

```sql
create policy "staff read supporters" on public.people
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff');

create policy "staff manage shifts" on public.shifts
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff');
```

The website keeps working whatever policies you add.

Two rules keep the two apps compatible:

- **Change rows freely, but not table structure.** Your app can read, add and edit rows. It shouldn't rename or drop the website's tables or columns. Structure changes go in `src/lib/db/schema.ts` and a new migration (`npm run db:generate`), so the website keeps working.
- **Every new website table needs row-level security turned on.** A test (`tests/rls.test.ts`) fails if a new table is missing it.

## Where each form's data lands

| On the website | Table(s) |
| --- | --- |
| Become a member | `people`, `memberships`, `contributions` (the fee) |
| Chip in (one-time) | `people`, `contributions` |
| Chip in (monthly) | `people`, `recurring_donations`, plus one `contributions` row per payment |
| Newsletter | `newsletter_subscribers` |
| Pledge and SkyTrain petition | `campaign_signatures` |
| Event RSVP | `event_rsvps` |
| Shop | `orders`, `order_items` |
| Volunteer shifts | `shift_openings` (published openings), `shifts` (one row per volunteer per shift), `volunteer_tasks` |
| Promise follows | `promise_follows` |
| Email and text consent | `consent_events` (append-only proof), plus `people.contact_consent_at` and `people.sms_consent_at` as the current state |
| Everything sent | `email_log`, `sms_log`, `email_campaigns` |
| Staff and audit | `admin_users`, `admin_sessions`, `audit_log` |
| Site copy, pages, images | `site_settings`, `site_pages`, `media` |
| Promise tracker (admin) | `tracker_promises`, `tracker_updates`, `tracker_announcements` |

Every person is stored once in `people`, matched by email. Their membership, donations, signatures and RSVPs all link back to that one row.
