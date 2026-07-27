import { PrismaService } from '../prisma-client.js';
import { DEFAULT_COMPANY_SLUG, seedCompany } from './seed.js';

/**
 * Integration test against the real `store_mgmt_test` Postgres database.
 * Covers the spec's "seed is idempotent" scenario (re-running never
 * duplicates), same discipline as `users/seed.spec.ts`.
 */
describe('seedCompany', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  // Wipe before AND after: migration 001 already seeds a `default`-slug
  // Company, so the `toHaveLength(1)` assertions below must not inherit it.
  beforeEach(async () => {
    await prisma.companyUser.deleteMany({});
    await prisma.company.deleteMany({});
  });

  afterEach(async () => {
    await prisma.companyUser.deleteMany({});
    await prisma.company.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates exactly one Company row with schemaName null', async () => {
    await seedCompany(prisma);

    const companies = await prisma.company.findMany();
    expect(companies).toHaveLength(1);
    expect(companies[0]?.slug).toBe(DEFAULT_COMPANY_SLUG);
    expect(companies[0]?.schemaName).toBeNull();
  });

  it('is idempotent: running the seed twice yields exactly 1 Company, never duplicates', async () => {
    await seedCompany(prisma);
    await seedCompany(prisma);

    const companies = await prisma.company.findMany();
    expect(companies).toHaveLength(1);
  });
});
