import Link from "next/link";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { PERMISSIONS, requireAdmin, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/server/admin-auth";
import { listStaff, ROLES } from "@/lib/server/staff";
import { changeRoleAction, deactivateAction, inviteAction, reactivateAction, resendLinkAction, resetPasswordAction } from "./actions";
import { InviteForm, StaffControls } from "./StaffForms";
import "../people/people.css";

const WHEN = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const ROLE_OPTIONS = ROLES.map((id) => ({
  id,
  label: ROLE_LABELS[id],
  summary: id === "owner" ? "everything, including staff accounts" : PERMISSIONS.filter((p) => ROLE_PERMISSIONS[id].includes(p.id)).map((p) => p.label.toLowerCase()).join(", "),
}));

export default async function StaffPage() {
  const user = await requireAdmin("users");
  const staff = await listStaff(getDb());
  const emailEnabled = env.emailEnabled;
  const actions = { changeRole: changeRoleAction, deactivate: deactivateAction, reactivate: reactivateAction, resetPassword: resetPasswordAction, resendLink: resendLinkAction };

  return (
    <>
      <div className="crm-head">
        <h1 className="h3">Staff accounts</h1>
        <nav className="crm-sub" aria-label="Related">
          <Link href="/admin/audit">Audit log</Link>
          <Link href="/admin/account">My account</Link>
        </nav>
      </div>

      <div className="stack" style={{ gap: 28 }}>
        <InviteForm action={inviteAction} roles={ROLE_OPTIONS} emailEnabled={emailEnabled} />

        <section aria-labelledby="staff-title">
          <h2 id="staff-title" className="h3" style={{ fontSize: 22, marginBottom: 12 }}>
            {staff.length} account{staff.length === 1 ? "" : "s"}
          </h2>
          <p className="small" style={{ marginBottom: 14 }}>
            The last active owner can&apos;t be demoted or deactivated, and nobody can deactivate themselves.
          </p>
          <ul className="staff-list">
            {staff.map((s) => (
              <li key={s.id} className={`staff ${s.active ? "" : "staff--inactive"}`}>
                <div className="staff__who">
                  <strong>{s.name}</strong>{" "}
                  <span className={`badge ${s.active ? "badge--navy" : "badge--bad"}`}>{s.active ? ROLE_LABELS[s.role] : "Deactivated"}</span>
                  {s.id === user.id && <span className="badge"> you</span>}
                  <p>
                    {s.email}
                    {!s.passwordSet && " · no password yet (signs in by email link)"}
                  </p>
                  <p>
                    {s.lastLoginAt ? `Last signed in ${WHEN.format(s.lastLoginAt)}` : "Never signed in"}
                    {s.activeSessions > 0 && ` · ${s.activeSessions} active session${s.activeSessions === 1 ? "" : "s"}`}
                    {s.invitedBy && ` · invited by ${s.invitedBy}`}
                    {` · added ${WHEN.format(s.createdAt)}`}
                  </p>
                </div>
                <StaffControls
                  id={s.id}
                  name={s.name}
                  role={s.role}
                  active={s.active}
                  passwordSet={s.passwordSet}
                  isSelf={s.id === user.id}
                  actorIsOwner={user.role === "owner"}
                  emailEnabled={emailEnabled}
                  roles={ROLE_OPTIONS}
                  actions={actions}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
