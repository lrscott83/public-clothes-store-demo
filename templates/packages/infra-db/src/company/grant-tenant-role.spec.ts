import { randomUUID } from 'node:crypto';
import { grantTenantRole } from './grant-tenant-role.js';
import { PrismaMembershipRepository } from './prisma-membership.repository.js';
import { PrismaMasterService } from '../master-prisma-client.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';

/**
 * Real Postgres, no mocks — mirrors `prisma-membership.repository.spec.ts`'s
 * and `prisma-customer.repository.spec.ts`'s discipline. Master `Company`/
 * `User` rows are hand-created (this helper does not itself provision a
 * schema — `useTenantSchema()`, task 5.1, does that).
 */
describe('grantTenantRole', () => {
  const getTenantSchema = useTenantSchema();
  const masterPrisma = new PrismaMasterService();
  const membershipRepository = new PrismaMembershipRepository(masterPrisma);
  let companyId: string;
  let userId: string;

  beforeAll(async () => {
    await masterPrisma.$connect();
  });

  beforeEach(async () => {
    const company = await masterPrisma.company.create({
      data: { name: 'Tienda Prueba', slug: `grant-role-${randomUUID()}` },
    });
    companyId = company.id;
    const user = await masterPrisma.user.create({
      data: { login: `grant.role.${randomUUID()}`, passwordHash: 'x', fullName: 'Grant Fixture' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await masterPrisma.membership.deleteMany({});
    await masterPrisma.user.deleteMany({});
    await masterPrisma.company.deleteMany({});
  });

  afterAll(async () => {
    await masterPrisma.$disconnect();
  });

  it('writes an ACTIVE master Membership AND a tenant CompanyUser with the given role', async () => {
    const { client } = getTenantSchema();

    const result = await grantTenantRole(membershipRepository, client, {
      userId,
      companyId,
      role: 32,
      createdByCompanyUserId: null,
    });

    expect(result.companyUserId).toBe(userId);
    const membership = await masterPrisma.membership.findUniqueOrThrow({
      where: { userId_companyId: { userId, companyId } },
    });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.id).toBe(result.membershipId);

    const companyUser = await client.companyUser.findUniqueOrThrow({ where: { id: userId } });
    expect(companyUser.role).toBe(32);
    expect(companyUser.createdByCompanyUserId).toBeNull();
  });

  it('is idempotent: re-running never duplicates the Membership and updates the CompanyUser role in place', async () => {
    const { client } = getTenantSchema();

    await grantTenantRole(membershipRepository, client, {
      userId,
      companyId,
      role: 1,
      createdByCompanyUserId: null,
    });
    const second = await grantTenantRole(membershipRepository, client, {
      userId,
      companyId,
      role: 16,
      createdByCompanyUserId: null,
    });

    const memberships = await masterPrisma.membership.findMany({ where: { userId, companyId } });
    expect(memberships).toHaveLength(1);

    const companyUser = await client.companyUser.findUniqueOrThrow({ where: { id: userId } });
    expect(companyUser.role).toBe(16);
    expect(second.companyUserId).toBe(userId);
  });
});
