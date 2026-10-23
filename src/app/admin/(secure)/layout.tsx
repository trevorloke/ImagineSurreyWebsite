import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Admin">
        <strong style={{ color: "var(--navy)", fontSize: 18 }}>Imagine Surrey admin</strong>
        <Link href="/admin">Supporters &amp; money</Link>
        <Link href="/admin/content">News, events &amp; shop</Link>
        <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
          Stripe dashboard ↗
        </a>
        <form method="post" action="/api/admin/logout" style={{ marginLeft: "auto" }}>
          <button type="submit" className="btn btn--outline" style={{ minHeight: 40 }}>
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
