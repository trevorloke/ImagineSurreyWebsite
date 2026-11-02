// End-to-end runner: resets a dedicated test database, migrates and seeds it,
// builds the site, starts it with the fake Stripe server, runs the suites,
// and tears everything down. Usage:
//   npm run e2e              # all suites
//   npm run e2e -- api       # one suite
// Environment: E2E_DATABASE_URL (a database that may be WIPED), E2E_PORT,
// E2E_STRIPE_PORT, E2E_SKIP_BUILD=1 to reuse the last build.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const root = path.resolve(import.meta.dirname, "..");
const dbUrl = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/imagine_surrey_e2e";
const port = Number(process.env.E2E_PORT ?? 3100);
const stripePort = Number(process.env.E2E_STRIPE_PORT ?? 12111);
const suites = process.argv.slice(2).length ? process.argv.slice(2) : ["api", "shifts", "tracker", "admin", "volunteer", "portal", "forms", "comms"];

const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  E2E_DATABASE_URL: dbUrl,
  E2E_PORT: String(port),
  E2E_STRIPE_PORT: String(stripePort),
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
  STRIPE_SECRET_KEY: "sk_test_local",
  STRIPE_WEBHOOK_SECRET: "whsec_localtestsecret",
  STRIPE_API_BASE: `http://localhost:${stripePort}`,
  CONTRIBUTION_LIMIT_CENTS: "142970",
  MEMBERSHIP_FEE_CENTS: "1000",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "local-admin-pw",
  ADMIN_SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
  NODE_ENV: "production",
};

function run(cmd, args, label) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`${label} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

// A clean database every run.
if (!/(_e2e|_test|rls_check)\b/.test(new URL(dbUrl).pathname)) {
  console.error(`Refusing to wipe ${dbUrl}: the e2e database name must end in _e2e or _test.`);
  process.exit(1);
}
const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
await sql.end();
run("npx", ["tsx", "scripts/migrate.ts"], "migrate");
run("npx", ["tsx", "scripts/seed.ts"], "seed");
if (!process.env.E2E_SKIP_BUILD || !existsSync(path.join(root, ".next", "BUILD_ID"))) run("npx", ["next", "build"], "build");

const children = [];
const start = (cmd, args, extraEnv = {}) => {
  // Own process group, so stopping it also stops the server npx starts.
  const child = spawn(cmd, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(d));
  children.push(child);
  return child;
};
start("node", ["e2e/fake-stripe.mjs"], { PORT: String(stripePort) });
start("npx", ["next", "start", "-p", String(port)]);

async function waitFor(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up in ${ms / 1000}s`);
}
await waitFor(`http://localhost:${stripePort}/__log`);
await waitFor(`http://localhost:${port}/`);

let failed = 0;
const resetSql = postgres(dbUrl, { max: 1, onnotice: () => {} });
for (const suite of suites) {
  console.log(`\n▶ suite: ${suite}`);
  // Each suite starts with the bootstrap owner only: suites test wrong
  // passwords, invite staff and change the owner's password, and none of that
  // may leak into the next suite. (Sign-in recreates the owner from
  // ADMIN_EMAIL + ADMIN_PASSWORD when no staff account exists.)
  await resetSql`delete from login_attempts`;
  await resetSql`delete from admin_users`;
  const r = spawnSync("node", [`e2e/${suite}.e2e.mjs`], { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) failed += 1;
}
await resetSql.end();
function stopAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill();
    }
  }
}
process.on("exit", stopAll);
stopAll();
console.log(failed ? `\n${failed} suite(s) FAILED` : "\nAll e2e suites passed");
process.exit(failed ? 1 : 0);
