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
