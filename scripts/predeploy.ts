// Runs before `next build` on Vercel (the "vercel-build" script). On a
// production deploy it brings the database up to date: pending migrations,
// then the seed, which only adds missing rows (it never overwrites anything
// changed in /admin). Preview deploys and local builds skip it.
// Set SKIP_DB_MIGRATE=1 to skip it on production too.
import { spawnSync } from "node:child_process";

const production = process.env.VERCEL_ENV === "production";
if (!production || process.env.SKIP_DB_MIGRATE === "1") {
  console.log(`Skipping database migrations (${production ? "SKIP_DB_MIGRATE=1" : `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`}).`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set for this production deploy; set it in Vercel → Settings → Environment Variables.");
  process.exit(1);
}
for (const script of ["scripts/migrate.ts", "scripts/seed.ts"]) {
  const r = spawnSync("npx", ["tsx", script], { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`${script} failed; the deploy stops here and the current site stays live.`);
    process.exit(r.status ?? 1);
  }
}
