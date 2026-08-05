// Jest runs in plain Node and does NOT auto-load `.env` the way `prisma.config.ts`
// does. Repository tests read `process.env.DATABASE_URL` directly (see
// `src/prisma-client.ts`), so load the package `.env` here before any test file
// runs.
//
// NOTE: `process.loadEnvFile()` (the Node 20.6+ built-in used by
// `prisma.config.ts`) is a no-op when called from inside Jest's sandboxed
// `vm` realm — it does not throw, but it silently fails to write into
// `process.env` (verified empirically: same file loads fine via plain
// `node -e`, but not under `jest`, with or without
// `--experimental-vm-modules`). So this setup file parses the `.env` file
// itself instead of relying on that built-in.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment variables (e.g. in CI) take precedence — never
    // override an already-set value, mirroring `prisma.config.ts`.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Test suites must NEVER touch the dev `store_mgmt` database — force
// DATABASE_URL onto the dedicated `store_mgmt_test` database before any test
// file (and therefore any PrismaService) is constructed. Set `TEST_URL` in
// `.env` to point somewhere else; the literal below is just a dev fallback.
//
// This is the BASE connection for the whole database, not one schema: the
// master/default client reads it as-is (Postgres' own default search_path
// resolves to `public`), and Phase 5's per-suite tenant clients
// (`TenantPrismaFactory`/`TenantDatabaseService`) reuse this SAME URL as
// their `pg.Pool`'s `connectionString`, then set `search_path` explicitly
// per connection (design.md D2) — so a `?schema=` query param here would be
// silently ignored by them (`pg`/`@prisma/adapter-pg`'s connectionString
// constructor never reads it; verified via `pg-connection-string`'s parser)
// and previously implied a public-only scoping this URL never actually had.
// Dropped rather than left misleading. It still matters to the Prisma CLI
// subprocess paths (`scripts/tenant-migrate.ts`, `prisma.config.ts`), which
// build their OWN per-tenant `?schema=<tenant>` override explicitly (design
// D6) instead of inheriting this one unmodified.
process.env.DATABASE_URL =
  process.env.TEST_URL ?? 'postgresql://postgres:postgres@172.17.0.1:5432/store_mgmt_test';
