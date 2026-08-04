import { PrismaMasterService } from '../master-prisma-client.js';
import { TenantDefaultPrismaService } from '../tenant/tenant-default-prisma.service.js';
import { PrismaCompanyRepository } from './prisma-company.repository.js';
import { wipeCompanyUserDependents } from '../db-cleanup.spec-helper.js';

/**
 * Integration tests against the real `store_mgmt_test` Postgres database (no
 * mocks) — same discipline as `prisma-customer.repository.spec.ts`.
 * `ICompanyRepository` is deliberately READ-ONLY (design.md §4) — rows are
 * seeded directly via `prisma.company.create` in test setup, mirroring how
 * migration 001 + `company/seed.ts` are the only production writers.
 * `Company` now lives on the master client (task 3.5); `company_user` still
 * has a real, RESTRICT-ing FK to `company` (unchanged legacy table, see
 * `TenantDefaultPrismaService`'s doc comment), so it must still be cleared
 * before `company.deleteMany` — through a companion legacy client, since
 * master's schema has no `companyUser` model to reach it with.
 */
describe('PrismaCompanyRepository', () => {
  let prisma: PrismaMasterService;
  let legacyPrisma: TenantDefaultPrismaService;
  let repository: PrismaCompanyRepository;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    legacyPrisma = new TenantDefaultPrismaService();
    repository = new PrismaCompanyRepository(prisma);
  });

  // Wipe before AND after: migration 001 seeds a `default`-slug Company, so
  // the "no Company exists" and "exactly one" assertions below would otherwise
  // depend on whether this database had been migrated yet.
  beforeEach(async () => {
    await wipeCompanyUserDependents(legacyPrisma);
    await legacyPrisma.companyUser.deleteMany({});
    await prisma.company.deleteMany({});
  });

  afterEach(async () => {
    await wipeCompanyUserDependents(legacyPrisma);
    await legacyPrisma.companyUser.deleteMany({});
    await prisma.company.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await legacyPrisma.$disconnect();
  });

  it('list() returns every persisted Company with schemaName null', async () => {
    await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });

    const companies = await repository.list();

    expect(companies).toHaveLength(1);
    expect(companies[0]?.name).toBe('Tienda Prueba');
    expect(companies[0]?.schemaName).toBeNull();
    expect(companies[0]?.isActive).toBe(true);
  });

  it('list() returns an empty array when no Company exists', async () => {
    const companies = await repository.list();
    expect(companies).toEqual([]);
  });

  it('findById() round-trips a persisted Company', async () => {
    const created = await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.slug).toBe('default');
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });
});
