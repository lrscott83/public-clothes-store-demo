// SINGLE seed entrypoint (Prisma's `migrations.seed` config, prisma.config.ts).
//
// Full orchestration (task 14.2 — the last piece of multi-tenant-by-schema's
// seed rewiring): master seed (cockpit User rows + the template catalog) ->
// provision ONE demo tenant via `provisionCompany` (design.md D7's saga
// steps, mirrored outside NestJS DI — see that module's doc comment) ->
// grant every cockpit account its tenant role -> seed demo customers ->
// seed demo orders. `prisma migrate reset && pnpm seed` (this script) is
// meant to reproduce the FULL demo dataset from an empty `public` schema,
// end to end — the spec success criterion this orchestration exists to
// satisfy. Plain CommonJS requiring the package's own BUILT dist/ output
// (run `pnpm build` first) — same "consume via built dist, not TS source"
// convention as every other cross-package import in this monorepo.
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
const { seedTemplateCatalog } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'product', 'seed.js'),
);
const { seedCockpitUsers, grantCockpitRoles } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'users', 'seed.js'),
);
const { seedCustomers } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'customer', 'seed.js'));
const { seedOrders } = require(path.join(PACKAGE_ROOT, 'dist', 'src', 'sales', 'seed.js'));
const { provisionCompany } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'company', 'provision-company.js'),
);
const { PrismaCompanyRepository } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'company', 'prisma-company.repository.js'),
);
const { PrismaMembershipRepository } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'company', 'prisma-membership.repository.js'),
);
const { TenantDatabaseService } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'tenant', 'tenant-database.service.js'),
);
const { TenantPrismaFactory } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'tenant', 'tenant-prisma-factory.js'),
);
const { DEFAULT_COMPANY_SLUG, DEFAULT_COMPANY_NAME } = require(
  path.join(PACKAGE_ROOT, 'dist', 'src', 'company', 'seed.js'),
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
  const masterPrisma = new PrismaMasterService();
  const companyRepository = new PrismaCompanyRepository(masterPrisma);
  const membershipRepository = new PrismaMembershipRepository(masterPrisma);
  const tenantDatabaseService = new TenantDatabaseService();
  const tenantFactory = new TenantPrismaFactory();

  try {
    // 1. Master seed: the template catalog (Phase 9) and the cockpit
    //    accounts' master User rows (no tenant grant yet — provisioning
    //    needs an EXISTING ownerId before it can run).
    const templateResult = await seedTemplateCatalog(masterPrisma, catalog);
    console.log(
      `Seeded ${templateResult.categoriesUpserted} template categories and ${templateResult.productsUpserted} template products (master, idempotent upsert).`,
    );

    const cockpitUsers = await seedCockpitUsers(masterPrisma);
    console.log(`Seeded ${cockpitUsers.usersUpserted} cockpit User rows (master, idempotent upsert).`);

    // 2. Provision the single demo tenant (design.md D7's saga steps,
    //    mirrored outside NestJS DI — see provision-company.ts). Idempotent:
    //    re-running `pnpm seed` without a reset reuses the existing tenant.
    const tenant = await provisionCompany(
      masterPrisma,
      companyRepository,
      membershipRepository,
      tenantDatabaseService,
      (schemaName) => tenantFactory.getClient(schemaName),
      { name: DEFAULT_COMPANY_NAME, slug: DEFAULT_COMPANY_SLUG, ownerId: cockpitUsers.ownerId },
    );
    console.log(
      `Provisioned tenant "${DEFAULT_COMPANY_SLUG}" (schema ${tenant.schemaName}, reused=${tenant.reused}): ` +
        `${tenant.categoriesCopied} categories and ${tenant.productsCopied} products copied from the template catalog.`,
    );

    const tenantClient = tenantFactory.getClient(tenant.schemaName);

    // 3. Grant every cockpit account its role inside the tenant (also
    //    seeds the 3 warehouses and links warehouse.operator).
    const rolesResult = await grantCockpitRoles(
      membershipRepository,
      tenantClient,
      tenant.companyId,
      cockpitUsers,
    );
    console.log(
      `Granted tenant roles to ${rolesResult.usersUpserted} cockpit accounts (idempotent).`,
    );

    // 4. Seed the 5 demo customers.
    const customerResult = await seedCustomers(masterPrisma, membershipRepository, tenantClient, tenant.companyId);
    console.log(`Seeded ${customerResult.customersUpserted} demo customers (idempotent).`);

    // 5. Seed the 4 demo orders, attributed to the cockpit sales agent.
    const salesAgentCompanyUserId = cockpitUsers.userIds['sales.agent'];
    const orderResult = await seedOrders(tenantClient, salesAgentCompanyUserId);
    console.log(`Seeded ${orderResult.ordersUpserted} demo orders (idempotent).`);
  } finally {
    await tenantFactory.onModuleDestroy();
    await masterPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
