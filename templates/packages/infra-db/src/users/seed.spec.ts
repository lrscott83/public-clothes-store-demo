import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma-client.js';
import { COCKPIT_LOGINS, deriveLogin, seedUsers } from './seed.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's "seed is idempotent" scenario (re-running never duplicates),
 * same discipline as `customer/seed.spec.ts`.
 */
describe('seedUsers', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterEach(async () => {
    await prisma.warehouseOperator.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces the 4 cockpit accounts with bcrypt-hashed dev passwords', async () => {
    await seedUsers(prisma);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(4);
    expect(users.map((u) => u.login).sort()).toEqual([...COCKPIT_LOGINS].sort());
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare('DevPass123!', user.passwordHash)).resolves.toBe(true);
    }
  });

  it('assigns admin the admin bit and owner the owner bit', async () => {
    await seedUsers(prisma);

    const admin = await prisma.user.findUniqueOrThrow({ where: { login: 'admin' } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { login: 'owner' } });
    expect(admin.roles & 16).toBe(16);
    expect(owner.roles & 8).toBe(8);
  });

  it('links warehouse.operator to a WarehouseOperator row scoped to a warehouse', async () => {
    await seedUsers(prisma);

    const operator = await prisma.user.findUniqueOrThrow({ where: { login: 'warehouse.operator' } });
    const link = await prisma.warehouseOperator.findUnique({ where: { userId: operator.id } });

    expect(link).not.toBeNull();
    expect(link?.warehouseId).toEqual(expect.any(String));
  });

  it('is idempotent: running the seed twice yields exactly 4 users, never duplicates', async () => {
    await seedUsers(prisma);
    await seedUsers(prisma);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(4);
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
