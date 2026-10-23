import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/admin-auth";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLogin({ searchParams }: PageProps<"/admin/login">) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <section className="section section--surface">
      <div className="container" style={{ maxWidth: 440 }}>
        <form method="post" action="/api/admin/login" className="form-card">
          <h1 className="h3" style={{ fontSize: 26 }}>
            Admin sign in
          </h1>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error === "locked" ? "Too many attempts. Try again in 15 minutes." : "That password isn't right."}
            </p>
          )}
          <button type="submit" className="btn btn--navy btn--lg">
            Sign in
          </button>
        </form>
      </div>
    </section>
  );
}
