// SINGLE seed entrypoint (Prisma's `migrations.seed` config, prisma.config.ts).
//
// MASTER ONLY FOR NOW (SDD change multi-tenant-by-schema, task 3.5 — WU3b;
// task 9.2 — Phase 9 restores the master TEMPLATE catalog half of this):
// seeds the master `Company` row (see src/company/seed.ts) and the master
// `TemplateCategory`/`TemplateProduct` rows (see src/product/seed.ts,
// `seedTemplateCatalog`) from the same 11-slug `catalog.json` the old
// combined seed used to write tenant-side. The product/warehouse/user/
// customer seeding this script used to run directly is still TENANT-side
// data — meaningless until a real tenant schema exists to hold it. Copying
// the master templates INTO a tenant's own Category/Product tables is
// `copy-catalog.ts`'s job, called by the provisioning saga (Phase 10, D7
// step 6), not this script. Full `prisma migrate reset && pnpm seed`
// wiring (master seed -> provision one tenant via the saga -> seed it) is
// Phase 14.2. Plain CommonJS requiring the package's own BUILT dist/
// output (run `pnpm build` first) — same "consume via built dist, not TS
// source" convention as every other cross-package import in this
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

const { PrismaMasterService } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'master-prisma-client.js'),
);
const { seedCompany } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'company', 'seed.js'));
const { seedTemplateCatalog } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'product', 'seed.js'),
);

const CATALOG_PATH = path.join(
  PACKAGE_ROOT,
  '..',
  '..',
  'apps',
  'salesops-mvp',
  'app',
  'data',
  'catalog.json',
);

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const prisma = new PrismaMasterService();

  try {
    const result = await seedCompany(prisma);
    console.log(`Seeded ${result.companiesUpserted} company (master, idempotent upsert).`);

    const templateResult = await seedTemplateCatalog(prisma, catalog);
    console.log(
      `Seeded ${templateResult.categoriesUpserted} template categories and ${templateResult.productsUpserted} template products (master, idempotent upsert).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
