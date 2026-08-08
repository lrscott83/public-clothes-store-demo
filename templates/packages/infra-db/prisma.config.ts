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

// This is the config the Prisma CLI auto-discovers with no `--config` flag —
// what `prisma migrate reset`/`prisma migrate dev`/`prisma db seed` all run
// against by default. Task 14.2: repointed from the pre-split monolith
// `prisma/schema.prisma` (deleted, along with its `prisma/migrations/`
// history) to the MASTER schema — `prisma/master/schema.prisma` +
// `prisma/master/migrations`, mirroring `prisma/master/prisma.config.ts`
// (used only when an explicit `--config` targets master specifically, e.g.
// `scripts/tenant-migrate.ts`'s sibling tooling). A bare `prisma migrate
// reset && pnpm seed` now resets `public` down to ONLY the master tables
// and reseeds through `prisma/seed.js`'s full orchestration (master seed ->
// provision one tenant via `provisionCompany` -> seed it) — the spec
// success criterion this repoint exists to satisfy.
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'master', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'master', 'migrations'),
    // SINGLE seed entrypoint — see prisma/seed.js. Consumes the package's
    // own built dist/ output, so run `pnpm build` before `prisma db seed`.
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
