import fs from 'fs';
import path from 'path';
import { defineConfig } from 'prisma/config';

// Prisma 7 with a prisma.config.ts no longer auto-loads .env, so load it here.
// Real environment variables (e.g. in CI) take precedence — loadEnvFile never
// overrides an already-set value.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
    // SINGLE seed entrypoint (seeds every Category + Product together,
    // idempotently) — see prisma/seed.js. Consumes the package's own built
    // dist/ output, so run `pnpm build` before `prisma db seed`.
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
