import type { Metadata } from "next";
import Link from "next/link";
import { adminPreviewAllowed } from "@/lib/preview-mode";
import { can, requireAdmin, ROLE_LABELS, type Permission } from "@/lib/server/admin-auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

// Every page under (secure) also calls requireAdmin itself: a layout check
// alone can be skipped by a direct request for the page segment.
const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/people", label: "Supporters", permission: "people" },
  { href: "/admin/shifts", label: "Volunteer shifts", permission: "shifts" },
  { href: "/admin/comms", label: "Email & texts", permission: "comms" },
  { href: "/admin/home", label: "Home page", permission: "settings" },
  { href: "/admin/content", label: "Content", permission: "content" },
  { href: "/admin/pages", label: "Pages", permission: "content" },
  { href: "/admin/media", label: "Media", permission: "content" },
  { href: "/admin/tracker", label: "Promise tracker", permission: "tracker" },
  { href: "/admin/desk-gifts", label: "Gifts to log at the desk", permission: "money" },
  { href: "/admin/limits", label: "Contribution limits", permission: "money" },
  { href: "/admin/settings", label: "Site settings", permission: "settings" },
  { href: "/admin/integrations", label: "Integrations", permission: "integrations" },
  { href: "/admin/exports", label: "Exports" },
  { href: "/admin/users", label: "Staff", permission: "users" },
  { href: "/admin/audit", label: "Audit log", permission: "users" },
  { href: "/admin/account", label: "My account" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="admin">
      {adminPreviewAllowed() && (
        <p role="status" className="no-print" style={{ margin: 0, padding: "8px 16px", background: "var(--yellow)", color: "var(--navy)", fontWeight: 700 }}>
          Preview mode: signed in automatically on this local copy. It cannot be turned on for the live site.
        </p>
      )}
      <nav className="admin-nav no-print" aria-label="Admin">
        <strong style={{ color: "var(--navy)", fontSize: 18 }}>Imagine Surrey admin</strong>
        {NAV.filter((item) => !item.permission || can(user, item.permission)).map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        <span className="small" style={{ marginLeft: "auto" }}>
          {user.name} · {ROLE_LABELS[user.role]}
        </span>
        <form method="post" action="/api/admin/logout">
          <button type="submit" className="btn btn--outline" style={{ minHeight: 40 }}>
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
