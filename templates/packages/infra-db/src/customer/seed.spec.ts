import { PrismaService } from '../prisma-client.js';
import { DEFAULT_COMPANY_SLUG } from '../company/seed.js';
import { CUSTOMER_NAMES, seedCustomers } from './seed.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's "Seed is idempotent" scenario (re-running never duplicates,
 * all rows `active=true`), same discipline as `inventory/seed.spec.ts`.
 * Since `backend-users-roles`, every seeded Customer also mints/links a
 * matching `User` — assertions cover both sides.
 */
describe('seedCustomers', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  // Wipe before AND after: migration 001 already seeds a `default`-slug
  // Company, so the single-company assertion below must not inherit it.
  // `company_user` goes first — `company` is its only hard FK parent.
  beforeEach(async () => {
    await prisma.companyUser.deleteMany({});
    await prisma.company.deleteMany({});
  });

  afterEach(async () => {
    await prisma.customer.deleteMany({});
    await prisma.companyUser.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly 5 active Customer rows with the demo names, documentId null, each linked to a User', async () => {
    await seedCustomers(prisma);

    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(5);
    expect(customers.every((c) => c.active)).toBe(true);
    expect(customers.every((c) => c.documentId === null)).toBe(true);
    expect(customers.every((c) => typeof c.userId === 'string' && c.userId.length > 0)).toBe(true);
    expect(customers.map((c) => c.fullName).sort()).toEqual([...CUSTOMER_NAMES].sort());

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(5);
    expect(users.every((u) => /^\$2[aby]\$/.test(u.passwordHash))).toBe(true);
  });

  it('is idempotent: running the seed twice yields exactly 5 customers and 5 users, never duplicates', async () => {
    await seedCustomers(prisma);
    await seedCustomers(prisma);

    const customers = await prisma.customer.findMany();
    const users = await prisma.user.findMany();
    expect(customers).toHaveLength(5);
    expect(users).toHaveLength(5);
  });

  it('gives every demo customer User an ACTIVE CompanyUser in the implicit company with the `user` bit', async () => {
    await seedCustomers(prisma);

    const company = await prisma.company.findUniqueOrThrow({
      where: { slug: DEFAULT_COMPANY_SLUG },
    });
    const users = await prisma.user.findMany();
    const assignments = await prisma.companyUser.findMany();

    expect(assignments).toHaveLength(5);
    for (const user of users) {
      const assignment = assignments.find((a) => a.userId === user.id);
      expect(assignment).toBeDefined();
      expect(assignment?.companyId).toBe(company.id);
      expect(assignment?.status).toBe('ACTIVE');
      expect(assignment?.role).toBe(1);
    }
  });

  it('is idempotent on the assignment side: running the seed twice yields exactly 5 CompanyUser rows', async () => {
    await seedCustomers(prisma);
    await seedCustomers(prisma);

    const assignments = await prisma.companyUser.findMany();
    const companies = await prisma.company.findMany();
    expect(assignments).toHaveLength(5);
    expect(companies).toHaveLength(1);
  });

  it('re-links the same Customer to the same User across re-seeds (stable derived login)', async () => {
    await seedCustomers(prisma);
    const firstPass = await prisma.customer.findMany({ orderBy: { fullName: 'asc' } });

    await seedCustomers(prisma);
    const secondPass = await prisma.customer.findMany({ orderBy: { fullName: 'asc' } });

    expect(secondPass.map((c) => c.userId)).toEqual(firstPass.map((c) => c.userId));
  });
});
