import { randomUUID } from 'node:crypto';
import { CUSTOMER_NAMES, seedCustomers } from './seed.js';
import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaMembershipRepository } from '../company/prisma-membership.repository.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';

/**
 * Real Postgres, no mocks, against a provisioned tenant schema (task 5.1).
 * Covers the spec's "Seed is idempotent" scenario (re-running never
 * duplicates, all rows `active=true`). Every seeded Customer mints/links a
 * matching master `User` PLUS an ACTIVE Membership + tenant CompanyUser
 * (task 14.2 reshape, design D1/D4) — assertions cover all three sides.
 */
describe('seedCustomers', () => {
  const getTenantSchema = useTenantSchema();
  const masterPrisma = new PrismaMasterService();
  const membershipRepository = new PrismaMembershipRepository(masterPrisma);
  let companyId: string;

  beforeAll(async () => {
    await masterPrisma.$connect();
  });

  beforeEach(async () => {
    const company = await masterPrisma.company.create({
      data: { name: 'Tienda Prueba', slug: `customer-seed-${randomUUID()}` },
    });
    companyId = company.id;
  });

  afterEach(async () => {
    const { client } = getTenantSchema();
    await client.customer.deleteMany({});
    await client.companyUser.deleteMany({});
    await masterPrisma.membership.deleteMany({});
    await masterPrisma.user.deleteMany({});
    await masterPrisma.company.deleteMany({});
  });

  afterAll(async () => {
    await masterPrisma.$disconnect();
  });

  it('produces exactly 5 active Customer rows with the demo names, documentId null, each linked to a tenant CompanyUser', async () => {
    const { client } = getTenantSchema();
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);

    const customers = await client.customer.findMany();
    expect(customers).toHaveLength(5);
    expect(customers.every((c) => c.active)).toBe(true);
    expect(customers.every((c) => c.documentId === null)).toBe(true);
    expect(customers.every((c) => typeof c.companyUserId === 'string' && c.companyUserId.length > 0)).toBe(
      true,
    );
    expect(customers.map((c) => c.fullName).sort()).toEqual([...CUSTOMER_NAMES].sort());

    const users = await masterPrisma.user.findMany();
    expect(users).toHaveLength(5);
    expect(users.every((u) => /^\$2[aby]\$/.test(u.passwordHash))).toBe(true);
  });

  it('is idempotent: running the seed twice yields exactly 5 customers and 5 users, never duplicates', async () => {
    const { client } = getTenantSchema();
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);

    const customers = await client.customer.findMany();
    const users = await masterPrisma.user.findMany();
    expect(customers).toHaveLength(5);
    expect(users).toHaveLength(5);
  });

  it('gives every demo customer an ACTIVE Membership + tenant CompanyUser carrying the `user` bit', async () => {
    const { client } = getTenantSchema();
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);

    const users = await masterPrisma.user.findMany();
    const memberships = await masterPrisma.membership.findMany({ where: { companyId } });
    const companyUsers = await client.companyUser.findMany();

    expect(memberships).toHaveLength(5);
    expect(companyUsers).toHaveLength(5);
    for (const user of users) {
      const membership = memberships.find((m) => m.userId === user.id);
      expect(membership?.status).toBe('ACTIVE');
      const companyUser = companyUsers.find((cu) => cu.id === user.id);
      expect(companyUser?.role).toBe(1);
    }
  });

  it('is idempotent on the assignment side: running the seed twice yields exactly 5 CompanyUser rows', async () => {
    const { client } = getTenantSchema();
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);

    const companyUsers = await client.companyUser.findMany();
    expect(companyUsers).toHaveLength(5);
  });

  it('re-links the same Customer to the same tenant CompanyUser across re-seeds (stable derived login)', async () => {
    const { client } = getTenantSchema();
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);
    const firstPass = await client.customer.findMany({ orderBy: { fullName: 'asc' } });

    await seedCustomers(masterPrisma, membershipRepository, client, companyId);
    const secondPass = await client.customer.findMany({ orderBy: { fullName: 'asc' } });

    expect(secondPass.map((c) => c.companyUserId)).toEqual(firstPass.map((c) => c.companyUserId));
  });
});
