import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { COCKPIT_LOGINS, deriveLogin, grantCockpitRoles, seedCockpitUsers } from './seed.js';
import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaMembershipRepository } from '../company/prisma-membership.repository.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';

/**
 * Real Postgres, no mocks — split discipline mirrors task 14.2's split of
 * the old single `seedUsers`: master `User` rows (`seedCockpitUsers`) and
 * tenant grants (`grantCockpitRoles`, against a provisioned tenant schema,
 * task 5.1) are exercised together, since that is how `prisma/seed.js`
 * actually calls them.
 */
describe('seedCockpitUsers + grantCockpitRoles', () => {
  const getTenantSchema = useTenantSchema();
  const masterPrisma = new PrismaMasterService();
  const membershipRepository = new PrismaMembershipRepository(masterPrisma);
  let companyId: string;

  beforeAll(async () => {
    await masterPrisma.$connect();
  });

  beforeEach(async () => {
    const company = await masterPrisma.company.create({
      data: { name: 'Tienda Prueba', slug: `cockpit-${randomUUID()}` },
    });
    companyId = company.id;
  });

  afterEach(async () => {
    const { client } = getTenantSchema();
    await client.warehouseOperator.deleteMany({});
    await client.companyUser.deleteMany({});
    await client.warehouse.deleteMany({});
    await masterPrisma.membership.deleteMany({});
    await masterPrisma.user.deleteMany({});
    await masterPrisma.company.deleteMany({});
  });

  afterAll(async () => {
    await masterPrisma.$disconnect();
  });

  it('seedCockpitUsers produces every cockpit account with bcrypt-hashed dev passwords', async () => {
    const result = await seedCockpitUsers(masterPrisma);

    expect(result.usersUpserted).toBe(COCKPIT_LOGINS.length);
    const users = await masterPrisma.user.findMany();
    expect(users).toHaveLength(COCKPIT_LOGINS.length);
    expect(users.map((u) => u.login).sort()).toEqual([...COCKPIT_LOGINS].sort());
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare('DevPass123!', user.passwordHash)).resolves.toBe(true);
    }
    expect(result.ownerId).toBe(result.userIds['owner']);
  });

  it('seedCockpitUsers is idempotent: running twice yields exactly one user per cockpit account', async () => {
    await seedCockpitUsers(masterPrisma);
    await seedCockpitUsers(masterPrisma);

    const users = await masterPrisma.user.findMany();
    expect(users).toHaveLength(COCKPIT_LOGINS.length);
  });

  it('grantCockpitRoles gives every account an ACTIVE Membership + tenant CompanyUser carrying its role bitmask', async () => {
    const expectedRoleByLogin: Record<string, number> = {
      admin: 16,
      owner: 8,
      'warehouse.operator': 2,
      'sales.operator': 4,
      'sales.agent': 32,
    };
    const { client } = getTenantSchema();
    const users = await seedCockpitUsers(masterPrisma);

    await grantCockpitRoles(membershipRepository, client, companyId, users);

    const memberships = await masterPrisma.membership.findMany({ where: { companyId } });
    const companyUsers = await client.companyUser.findMany();
    expect(memberships).toHaveLength(COCKPIT_LOGINS.length);
    expect(companyUsers).toHaveLength(COCKPIT_LOGINS.length);
    for (const [login, userId] of Object.entries(users.userIds)) {
      const membership = memberships.find((m) => m.userId === userId);
      expect(membership?.status).toBe('ACTIVE');
      const companyUser = companyUsers.find((cu) => cu.id === userId);
      expect(companyUser?.role).toBe(expectedRoleByLogin[login]);
    }
  });

  it('grantCockpitRoles links warehouse.operator to a WarehouseOperator row scoped to a real warehouse', async () => {
    const { client } = getTenantSchema();
    const users = await seedCockpitUsers(masterPrisma);

    await grantCockpitRoles(membershipRepository, client, companyId, users);

    const operatorId = users.userIds['warehouse.operator']!;
    const link = await client.warehouseOperator.findUnique({ where: { companyUserId: operatorId } });
    expect(link).not.toBeNull();
    expect(link?.warehouseId).toEqual(expect.any(String));
  });

  it('grantCockpitRoles is idempotent: running twice yields exactly one Membership/CompanyUser per account', async () => {
    const { client } = getTenantSchema();
    const users = await seedCockpitUsers(masterPrisma);

    await grantCockpitRoles(membershipRepository, client, companyId, users);
    await grantCockpitRoles(membershipRepository, client, companyId, users);

    const memberships = await masterPrisma.membership.findMany({ where: { companyId } });
    const companyUsers = await client.companyUser.findMany();
    expect(memberships).toHaveLength(COCKPIT_LOGINS.length);
    expect(companyUsers).toHaveLength(COCKPIT_LOGINS.length);
  });
});

describe('deriveLogin', () => {
  it('normalizes non-alphanumeric runs to a single dot and appends a 6-char id fragment', () => {
    const login = deriveLogin('José Díaz', '8ba72f73-6a1b-43f5-8c5d-a47a3deaec49');
    expect(login).toBe('jos.d.az.8ba72f');
  });

  it('produces distinct logins for two customers sharing the same full name', () => {
    const a = deriveLogin('José Díaz', '8ba72f73-6a1b-43f5-8c5d-a47a3deaec49');
    const b = deriveLogin('José Díaz', 'd4d41cc0-8150-4796-9d49-912c4a6269da');
    expect(a).not.toBe(b);
  });
});
