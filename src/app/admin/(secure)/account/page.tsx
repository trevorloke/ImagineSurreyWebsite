import Link from "next/link";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { parseSessionCookie, PASSWORD_MIN_LENGTH, requireAdmin, ROLE_LABELS, SESSION_COOKIE } from "@/lib/server/admin-auth";
import { describeUserAgent, listSessions } from "@/lib/server/staff";
import { changePasswordAction, renameAction, signOutEverywhereAction } from "./actions";
import { PasswordForm, RenameForm, SignOutEverywhereForm } from "./AccountForms";
import "../people/people.css";

const WHEN = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The signed-in admin's own name, password and sessions. Any role. */
export default async function AccountPage() {
  const user = await requireAdmin();
  const db = getDb();
  const [account, sessions, currentId] = await Promise.all([
    db.query.adminUsers.findFirst({ where: eq(adminUsers.id, user.id), columns: { passwordHash: true } }),
    listSessions(db, user.id),
    cookies().then((jar) => parseSessionCookie(jar.get(SESSION_COOKIE)?.value)?.id ?? null),
  ]);

  return (
    <>
      <div className="crm-head">
        <h1 className="h3">My account</h1>
        <p className="small">
          {user.email} · {ROLE_LABELS[user.role]}
        </p>
        <nav className="crm-sub" aria-label="Related">
          <Link href="/admin">Dashboard</Link>
        </nav>
      </div>

      <div className="profile-grid">
        <div className="stack" style={{ gap: 24 }}>
          <section className="profile-card" aria-labelledby="name-title">
            <h2 id="name-title">Name</h2>
            <RenameForm action={renameAction} name={user.name} />
          </section>
          <section className="profile-card" aria-labelledby="password-title">
            <h2 id="password-title">Password</h2>
            <PasswordForm action={changePasswordAction} passwordSet={Boolean(account?.passwordHash)} minLength={PASSWORD_MIN_LENGTH} />
          </section>
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <section className="profile-card" aria-labelledby="sessions-title">
            <h2 id="sessions-title">Where you&apos;re signed in</h2>
            <ul className="notes">
              {sessions.map((s) => (
                <li key={s.id} className="note">
                  <span className="note__meta">
                    {s.id === currentId ? "This device · " : ""}
                    signed in {WHEN.format(s.createdAt)} · last seen {WHEN.format(s.lastSeenAt)}
                  </span>
                  {describeUserAgent(s.userAgent)}
                  {s.ip ? ` · ${s.ip}` : ""}
                </li>
              ))}
            </ul>
            <SignOutEverywhereForm action={signOutEverywhereAction} />
          </section>
        </div>
      </div>
    </>
  );
}
