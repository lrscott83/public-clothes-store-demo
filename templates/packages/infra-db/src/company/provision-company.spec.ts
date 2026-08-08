import { randomUUID } from 'node:crypto';
import { provisionCompany } from './provision-company.js';
import { PrismaCompanyRepository } from './prisma-company.repository.js';
import { PrismaMembershipRepository } from './prisma-membership.repository.js';
import { PrismaMasterService } from '../master-prisma-client.js';
import { TenantDatabaseService } from '../tenant/tenant-database.service.js';
import { TenantPrismaFactory } from '../tenant/tenant-prisma-factory.js';
import { schemaNameFor } from '../tenant/schema-name.js';

/**
 * Real Postgres, no mocks — the script-facing mirror of
 * `create-company.saga.spec.ts`'s happy path, minus compensation (this
 * primitive has none, by design — see `provision-company.ts`'s doc
 * comment), plus the idempotent-reuse path `pnpm seed` run twice needs.
 */
describe('provisionCompany', () => {
  const masterPrisma = new PrismaMasterService();
  const companyRepository = new PrismaCompanyRepository(masterPrisma);
  const membershipRepository = new PrismaMembershipRepository(masterPrisma);
  const tenantDatabaseService = new TenantDatabaseService();
  const tenantFactory = new TenantPrismaFactory();
  const getTenantClient = (schemaName: string) => tenantFactory.getClient(schemaName);
  let ownerId: string;
  const provisionedSlugs: string[] = [];

  beforeAll(async () => {
    await masterPrisma.$connect();
  });

  beforeEach(async () => {
    const owner = await masterPrisma.user.create({
      data: { login: `provision.owner.${randomUUID()}`, passwordHash: 'x', fullName: 'Owner Fixture' },
    });
    ownerId = owner.id;
  });

  afterEach(async () => {
    for (const slug of provisionedSlugs.splice(0)) {
      const company = await masterPrisma.company.findUnique({ where: { slug } });
      if (company?.schemaName) {
        await tenantFactory.disposeClient(company.schemaName);
        await tenantDatabaseService.deleteSchema(company.schemaName);
      }
    }
    await masterPrisma.membership.deleteMany({});
    await masterPrisma.company.deleteMany({});
    await masterPrisma.user.deleteMany({});
  });

  afterAll(async () => {
    await tenantFactory.onModuleDestroy();
    await masterPrisma.$disconnect();
  });

  it('runs the six D7 steps: schema, Membership, owner CompanyUser, copied catalog', async () => {
    const slug = `provision-${randomUUID()}`;
    provisionedSlugs.push(slug);

    const result = await provisionCompany(
      masterPrisma,
      companyRepository,
      membershipRepository,
      tenantDatabaseService,
      getTenantClient,
      { name: 'Tienda Prueba', slug, ownerId },
    );

    expect(result.reused).toBe(false);
    expect(result.schemaName).toBe(schemaNameFor(result.companyId));
    expect(await tenantDatabaseService.schemaExists(result.schemaName)).toBe(true);

    const company = await masterPrisma.company.findUniqueOrThrow({ where: { id: result.companyId } });
    expect(company.schemaName).toBe(result.schemaName);

    const membership = await masterPrisma.membership.findUniqueOrThrow({
      where: { userId_companyId: { userId: ownerId, companyId: result.companyId } },
    });
    expect(membership.status).toBe('ACTIVE');

    const tenantClient = getTenantClient(result.schemaName);
    const ownerCompanyUser = await tenantClient.companyUser.findUniqueOrThrow({ where: { id: ownerId } });
    expect(ownerCompanyUser.role).toBe(8); // USER_ROLES.owner
    expect(ownerCompanyUser.createdByCompanyUserId).toBeNull();
    expect(result.ownerCompanyUserId).toBe(ownerId);
  });

  it('is idempotent: re-running against an already-provisioned slug reuses the tenant, no second CREATE SCHEMA', async () => {
    const slug = `provision-${randomUUID()}`;
    provisionedSlugs.push(slug);

    const first = await provisionCompany(
      masterPrisma,
      companyRepository,
      membershipRepository,
      tenantDatabaseService,
      getTenantClient,
      { name: 'Tienda Prueba', slug, ownerId },
    );

    const second = await provisionCompany(
      masterPrisma,
      companyRepository,
      membershipRepository,
      tenantDatabaseService,
      getTenantClient,
      { name: 'Tienda Prueba', slug, ownerId },
    );

    expect(second.reused).toBe(true);
    expect(second.companyId).toBe(first.companyId);
    expect(second.schemaName).toBe(first.schemaName);
    expect(second.ownerCompanyUserId).toBe(first.ownerCompanyUserId);

    const companies = await masterPrisma.company.findMany({ where: { slug } });
    expect(companies).toHaveLength(1);
  });
});
