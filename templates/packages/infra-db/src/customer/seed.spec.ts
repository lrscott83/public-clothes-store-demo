import { PrismaService } from '../prisma-client.js';
import { CUSTOMER_NAMES, seedCustomers } from './seed.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's "Seed is idempotent" scenario (re-running never duplicates,
 * all rows `active=true`), same discipline as `inventory/seed.spec.ts`.
 */
describe('seedCustomers', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterEach(async () => {
    await prisma.customer.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly 5 active Customer rows with the demo names, documentId null', async () => {
    await seedCustomers(prisma);

    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(5);
    expect(customers.every((c) => c.active)).toBe(true);
    expect(customers.every((c) => c.documentId === null)).toBe(true);
    expect(customers.map((c) => c.fullName).sort()).toEqual([...CUSTOMER_NAMES].sort());
  });

  it('is idempotent: running the seed twice yields exactly 5 rows, never duplicates', async () => {
    await seedCustomers(prisma);
    await seedCustomers(prisma);

    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(5);
  });
});
