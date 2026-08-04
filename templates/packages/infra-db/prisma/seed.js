// SINGLE seed entrypoint (Prisma's `migrations.seed` config, prisma.config.ts).
//
// MASTER ONLY FOR NOW (SDD change multi-tenant-by-schema, task 3.5 — WU3b):
// seeds just the master `Company` row (see src/company/seed.ts). The
// product/warehouse/user/customer seeding this script used to run is
// TENANT-side data — meaningless until a real tenant schema exists to hold
// it (Phase 10's provisioning saga). Restoring it is explicitly Phase 9
// (template catalog copy) / Phase 14.2 (full `prisma migrate reset && pnpm
// seed` wiring: master seed -> provision one tenant via the saga -> seed
// it), not this task. Plain CommonJS requiring the package's own BUILT
// dist/ output (run `pnpm build` first) — same "consume via built dist, not
// TS source" convention as every other cross-package import in this
// monorepo.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Prisma's CLI spawns this script from an unspecified cwd — resolve every
// path relative to THIS file's own on-disk location, never process.cwd().
const PACKAGE_ROOT = path.join(__dirname, '..');

const envPath = path.join(PACKAGE_ROOT, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const { PrismaService } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'prisma-client.js'));
const { seedCompany } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'company', 'seed.js'));

async function main() {
  const prisma = new PrismaService();

  try {
    const result = await seedCompany(prisma);
    console.log(`Seeded ${result.companiesUpserted} company (master, idempotent upsert).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
