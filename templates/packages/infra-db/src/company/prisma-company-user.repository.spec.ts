import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma-client.js';
import { PrismaCompanyUserRepository } from './prisma-company-user.repository.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt_test` Postgres database (no
 * mocks) — same discipline as `prisma-user.repository.spec.ts`. `userId` has
 * NO DB-level FK to `app_user` (D1, soft FK) — most cases use a real `User`
 * row anyway to mirror production usage, but `findActiveByUserId`/uniqueness
 * cases also confirm the soft-FK shape by using a userId that does NOT
 * reference any `User` row and still succeeding.
 */
describe('PrismaCompanyUserRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaCompanyUserRepository;
  let companyId: string;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaCompanyUserRepository(prisma);
  });

  /**
   * `created_by_company_user_id` is a SELF-FK with `ON DELETE RESTRICT`, and
   * RESTRICT is enforced per row rather than at end-of-statement — so a single
   * `deleteMany({})` spanning both an assignment and the one that created it
   * fails. Provisioned assignments (the ones carrying a creator) go first.
   */
  async function wipeCompanyUsers(): Promise<void> {
    await prisma.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
    await prisma.companyUser.deleteMany({});
  }

  beforeEach(async () => {
    // Wipe FIRST, not just in afterEach: migration 001 seeds a `default`-slug
    // Company, so a create here would hit the slug unique index on the very
    // first test against a freshly migrated database.
    await wipeCompanyUsers();
    await prisma.company.deleteMany({});
    const company = await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });
    companyId = company.id;
  });

  afterEach(async () => {
    await wipeCompanyUsers();
    await prisma.company.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createTestUser(): Promise<string> {
    const user = await prisma.user.create({
      data: { login: `spec.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Test User' },
    });
    return user.id;
  }

  it('create() persists a CompanyUser with a real DB-generated UUID id, defaulting status to ACTIVE', async () => {
    const userId = await createTestUser();

    const created = await repository.create({ userId, companyId, role: 1 });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.userId).toBe(userId);
    expect(created.companyId).toBe(companyId);
    expect(created.role).toBe(1);
    expect(created.status).toBe('ACTIVE');
  });

  it('create() succeeds with a userId that does not reference any User row (soft FK, D1)', async () => {
    const orphanUserId = randomUUID();

    const created = await repository.create({ userId: orphanUserId, companyId, role: 1 });

    expect(created.userId).toBe(orphanUserId);
  });

  it('create() accepts an explicit non-ACTIVE status', async () => {
    const userId = await createTestUser();

    const created = await repository.create({ userId, companyId, role: 1, status: 'REVOKED' });

    expect(created.status).toBe('REVOKED');
  });

  it('create() defaults createdByCompanyUserId to null — signup and seed rows have no provisioner', async () => {
    const userId = await createTestUser();

    const created = await repository.create({ userId, companyId, role: 1 });

    expect(created.createdByCompanyUserId).toBeNull();
  });

  it('create() round-trips an explicit createdByCompanyUserId through the self-FK', async () => {
    const creator = await repository.create({ userId: await createTestUser(), companyId, role: 2 });

    const created = await repository.create({
      userId: await createTestUser(),
      companyId,
      role: 1,
      createdByCompanyUserId: creator.id,
    });

    expect(created.createdByCompanyUserId).toBe(creator.id);
    const reread = await repository.findByUserAndCompany(created.userId, companyId);
    expect(reread?.createdByCompanyUserId).toBe(creator.id);
  });

  it('rejects a duplicate (userId, companyId) assignment', async () => {
    const userId = await createTestUser();
    await repository.create({ userId, companyId, role: 1 });

    await expect(repository.create({ userId, companyId, role: 2 })).rejects.toThrow();
  });

  it('findActiveByUserId() returns the sole ACTIVE assignment for a user', async () => {
    const userId = await createTestUser();
    await repository.create({ userId, companyId, role: 4 });

    const found = await repository.findActiveByUserId(userId);

    expect(found).not.toBeNull();
    expect(found?.role).toBe(4);
    expect(found?.status).toBe('ACTIVE');
  });

  it('findActiveByUserId() returns null when the only assignment is REVOKED', async () => {
    const userId = await createTestUser();
    await repository.create({ userId, companyId, role: 1, status: 'REVOKED' });

    const found = await repository.findActiveByUserId(userId);

    expect(found).toBeNull();
  });

  it('findActiveByUserId() returns null when no assignment exists', async () => {
    const found = await repository.findActiveByUserId(randomUUID());
    expect(found).toBeNull();
  });

  it('findByUserAndCompany() round-trips a persisted assignment', async () => {
    const userId = await createTestUser();
    await repository.create({ userId, companyId, role: 8 });

    const found = await repository.findByUserAndCompany(userId, companyId);

    expect(found).not.toBeNull();
    expect(found?.role).toBe(8);
  });

  it('findByUserAndCompany() returns null for a non-matching pair', async () => {
    const userId = await createTestUser();

    const found = await repository.findByUserAndCompany(userId, companyId);

    expect(found).toBeNull();
  });

  it('updateRole() persists a new role bitmask for the (userId, companyId) pair', async () => {
    const userId = await createTestUser();
    await repository.create({ userId, companyId, role: 1 });

    const updated = await repository.updateRole(userId, companyId, 8);

    expect(updated.role).toBe(8);
    const found = await repository.findByUserAndCompany(userId, companyId);
    expect(found?.role).toBe(8);
  });

  it('listByCompany() returns every assignment scoped to that company', async () => {
    const userIdA = await createTestUser();
    const userIdB = await createTestUser();
    await repository.create({ userId: userIdA, companyId, role: 1 });
    await repository.create({ userId: userIdB, companyId, role: 2 });

    const list = await repository.listByCompany(companyId);

    expect(list).toHaveLength(2);
    expect(list.map((cu) => cu.userId).sort()).toEqual([userIdA, userIdB].sort());
  });

  it('listByCompany() returns an empty array for a company with no assignments', async () => {
    const otherCompany = await prisma.company.create({ data: { name: 'Otra', slug: 'otra' } });

    const list = await repository.listByCompany(otherCompany.id);

    expect(list).toEqual([]);
  });
});
