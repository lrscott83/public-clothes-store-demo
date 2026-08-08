// Jest runs in plain Node before NestJS's `ConfigModule.forRoot()` gets a
// chance to load the package `.env` (that only happens once `AppModule` is
// imported by a test file). This setup file parses the package `.env`
// itself and force-points DATABASE_URL at the dedicated `store_mgmt_test`
// database BEFORE any test file (and therefore any PrismaService) is
// constructed — mirroring `packages/infra-db/jest.setup.js`. Test suites
// must NEVER touch the dev `store_mgmt` database.
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

// Set TEST_URL in `.env` to point somewhere else; the literal below is just
// a dev fallback, never shipped (this file is test-only, not part of dist).
//
// This is the BASE connection for the whole database, not one schema: the
// master/default client reads it as-is (Postgres' own default search_path
// resolves to `public`), and this suite's per-suite tenant clients
// (`TenantPrismaFactory`/`TenantDatabaseService`, task 12.2/12.3) reuse this
// SAME URL as their `pg.Pool`'s `connectionString`, then set `search_path`
// explicitly per connection (design.md D2) — so a `?schema=` query param
// here would be silently ignored by them (`pg`/`@prisma/adapter-pg`'s
// connectionString constructor never reads it; verified via
// `pg-connection-string`'s parser) and previously implied a public-only
// scoping this URL never actually had. Dropped rather than left misleading.
process.env.DATABASE_URL =
  process.env.TEST_URL ?? 'postgresql://postgres:postgres@172.17.0.1:5432/store_mgmt_test';
