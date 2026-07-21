// SINGLE seed entrypoint (Prisma's `migrations.seed` config, prisma.config.ts):
// seeds every Category + Product together from the MVP's catalog.json
// (see src/product/seed.ts), the 3 Warehouse rows (see
// src/inventory/seed.ts), and the 5 demo Customer rows (see
// src/customer/seed.ts) — NO StockLevel rows are ever seeded (lazy
// creation on first movement). All idempotent. Plain CommonJS requiring the
// package's own BUILT dist/ output (run `pnpm build` first) — same "consume
// via built dist, not TS source" convention as every other cross-package
// import in this monorepo.
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
const { seedProducts } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'product', 'seed.js'));
const { seedWarehouses } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'inventory', 'seed.js'));
const { seedCustomers } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'customer', 'seed.js'));

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
  const prisma = new PrismaService();

  try {
    const result = await seedProducts(prisma, catalog);
    console.log(
      `Seeded ${result.categoriesUpserted} categories and ${result.productsUpserted} products (idempotent upsert).`,
    );

    const inventoryResult = await seedWarehouses(prisma);
    console.log(
      `Seeded ${inventoryResult.warehousesUpserted} warehouses (idempotent upsert, no StockLevel rows).`,
    );

    const customerResult = await seedCustomers(prisma);
    console.log(`Seeded ${customerResult.customersUpserted} customers (idempotent upsert).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
