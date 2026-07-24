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
process.env.DATABASE_URL =
  process.env.TEST_URL ??
  'postgresql://postgres:postgres@172.17.0.1:5432/store_mgmt_test?schema=public';
