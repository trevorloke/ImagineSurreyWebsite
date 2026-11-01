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

   Run both commands again whenever you deploy a version with new migrations in `drizzle/`.

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
   | `ADMIN_PASSWORD` | A long password for `/admin` |
   | `ADMIN_SESSION_SECRET` | A long random string, e.g. from `openssl rand -hex 32` |

7. **Click Deploy.**

8. **Connect Stripe's payment notices.** In Stripe → Developers → Webhooks, add the endpoint `https://<your-site>/api/stripe/webhook` and select these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `invoice.paid`
   - `customer.subscription.deleted`
   - `charge.refunded`

   Copy the endpoint's signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` in Vercel, then redeploy.

9. **Add your domain.** In Vercel → Settings → Domains, add `imaginesurrey.ca` and follow the DNS instructions. Then:
   - change `NEXT_PUBLIC_SITE_URL` to `https://imaginesurrey.ca`
   - change the Stripe webhook address to the new domain
   - redeploy

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
| Volunteer shifts (admin) | `shifts`, `volunteer_tasks` |
| Promise tracker (admin) | `tracker_promises`, `tracker_updates`, `tracker_announcements` |

Every person is stored once in `people`, matched by email. Their membership, donations, signatures and RSVPs all link back to that one row.
