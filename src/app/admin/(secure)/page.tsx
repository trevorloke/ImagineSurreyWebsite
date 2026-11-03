import Link from "next/link";
import { Sparkline } from "@/components/admin/people/Sparkline";
import { getDb } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { can, PERMISSIONS, requireAdmin, type Permission } from "@/lib/server/admin-auth";
import { dashboardTotals, needsAttention, weeklyTrend } from "@/lib/server/admin-data";
import "./people/people.css";

const QUICK_LINKS: { href: string; label: string; permission?: Permission }[] = [
  { href: "/admin/people", label: "Supporters", permission: "people" },
  { href: "/admin/people/sources", label: "Where sign-ups come from", permission: "people" },
  { href: "/admin/exports", label: "Exports" },
  { href: "/admin/users", label: "Staff accounts", permission: "users" },
  { href: "/admin/audit", label: "Audit log", permission: "users" },
  { href: "/admin/account", label: "My account" },
];

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const denied = PERMISSIONS.find((p) => p.id === sp.denied);
  const db = getDb();
  const [totals, trend, attention] = await Promise.all([dashboardTotals(db), weeklyTrend(db), needsAttention(db)]);
  const money = (cents: number) => formatCents(cents);

  const tiles: { value: string; label: string; href?: string }[] = [
    { value: String(totals.active_members), label: "Active members", href: "/admin/people?membership=active" },
    { value: String(totals.monthly_donors), label: "Monthly donors" },
    { value: money(totals.raised_this_year_cents), label: "Raised this year" },
    { value: String(totals.subscribers), label: "Newsletter subscribers", href: "/admin/people?newsletter=subscribed" },
    { value: String(totals.signatures), label: "Signatures" },
    { value: String(totals.volunteers_this_week), label: "Volunteers this week", href: "/admin/shifts" },
    { value: String(totals.orders_to_fulfil), label: "Orders to ship", href: "/admin/exports?view=orders" },
  ];

  const items: { n: number; text: string; href: string; link: string; level: "ok" | "warn" | "bad"; permission?: Permission }[] = [
    { n: attention.failedEmailsToday, text: "emails failed to send today", href: "/admin/comms", link: "Open email & texts", level: "bad", permission: "comms" },
    { n: attention.ordersToFulfil, text: "paid orders waiting to ship", href: "/admin/exports?view=orders", link: "See orders", level: "warn", permission: "money" },
    { n: attention.stalePendingMemberships, text: "memberships pending payment for over an hour", href: "/admin/people?membership=pending", link: "See who", level: "warn", permission: "people" },
    { n: attention.overduePromises, text: "promises past their target date", href: "/admin/tracker", link: "Score them", level: "warn", permission: "tracker" },
  ];
  const open = items.filter((i) => i.n > 0);

  return (
    <>
      <div className="crm-head">
        <h1 className="h3">Dashboard</h1>
        <p className="small">Signed in as {user.name}. Numbers are for Pacific time; money is net of refunds.</p>
      </div>

      {denied && (
        <div role="alert" className="alert" style={{ marginBottom: 20 }}>
          <span aria-hidden="true" className="alert-icon">
            !
          </span>
          <span>
            Your role can&apos;t open that section ({denied.label.toLowerCase()}). Ask an owner if you need access.
          </span>
        </div>
      )}

      <div className="quick-links">
        {QUICK_LINKS.filter((l) => !l.permission || can(user, l.permission)).map((l) => (
          <Link key={l.href} href={l.href} className="btn btn--outline btn--compact">
            {l.label}
          </Link>
        ))}
      </div>

      <div className="stats">
        {tiles.map((t) => (
          <div className="stat" key={t.label}>
            <div className="value">{t.value}</div>
            <div className="label">{t.href && (!t.href.startsWith("/admin/people") || can(user, "people")) ? <Link href={t.href}>{t.label}</Link> : t.label}</div>
          </div>
        ))}
      </div>

      <div className="trends">
        <Sparkline id="trend-supporters" label="New supporters" unit="People" points={trend.map((p) => ({ label: p.weekStart, value: p.newSupporters }))} />
        <Sparkline id="trend-raised" label="Contributions" unit="Raised" points={trend.map((p) => ({ label: p.weekStart, value: p.raisedCents }))} format={money} />
      </div>

      <section aria-labelledby="attention-title" style={{ marginBottom: 32 }}>
        <h2 id="attention-title" className="h3" style={{ fontSize: 22, marginBottom: 12 }}>
          Needs attention
        </h2>
        {open.length === 0 ? (
          <p className="empty-state">Nothing is waiting on you right now.</p>
        ) : (
          <ul className="attention">
            {open.map((i) => (
              <li key={i.text} data-level={i.level}>
                <span className="attention__n">{i.n}</span>
                <span className="attention__text">
                  {i.text}
                  {(!i.permission || can(user, i.permission)) && (
                    <>
                      {" "}
                      <Link href={i.href}>{i.link}</Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
