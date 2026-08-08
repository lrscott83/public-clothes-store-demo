import fs from 'fs';
import path from 'path';
import { defineConfig } from 'prisma/config';

// Prisma 7 with a prisma.config.ts no longer auto-loads .env, so load it
// here — same as the package-root prisma.config.ts. Real environment
// variables (e.g. in CI, or an explicit `DATABASE_URL=...?schema=<tenant>`
// invocation, design.md D6) always take precedence — loadEnvFile never
// overrides an already-set value.
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// Tenant schemas carry NO `_prisma_migrations` history (design.md D6) —
// this `migrations.path` exists only to satisfy `defineConfig`'s shape;
// nothing under it is ever generated or applied. The truth is
// `prisma/tenant-schema.sql`, generated from this schema.prisma by
// `scripts/generate-tenant-schema-sql.ts` (task 3.3) and applied per-schema
// via `SET search_path` + raw SQL (design.md D7) or by
// `scripts/tenant-migrate.ts` for fleet evolution.
export default defineConfig({
  schema: path.join(__dirname, 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
