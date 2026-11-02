import type { Metadata } from "next";
import Link from "next/link";
import { can, requireAdmin, ROLE_LABELS, type Permission } from "@/lib/server/admin-auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

// Every page under (secure) also calls requireAdmin itself: a layout check
// alone can be skipped by a direct request for the page segment.
const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/people", label: "Supporters", permission: "people" },
  { href: "/admin/shifts", label: "Volunteer shifts", permission: "shifts" },
  { href: "/admin/comms", label: "Email & texts", permission: "comms" },
  { href: "/admin/content", label: "Content", permission: "content" },
  { href: "/admin/pages", label: "Pages", permission: "content" },
  { href: "/admin/media", label: "Media", permission: "content" },
  { href: "/admin/tracker", label: "Promise tracker", permission: "tracker" },
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
