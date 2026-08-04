import { randomUUID } from 'node:crypto';
import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaMembershipRepository } from './prisma-membership.repository.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt_test` Postgres database (no
 * mocks) — same discipline as `prisma-company.repository.spec.ts`. Every row
 * here lives in the MASTER schema (`prisma/master/schema.prisma`, task 3.1);
 * `Membership.userId`/`companyId` are real FKs (`onDelete: Cascade`) to
 * `User`/`Company`, so fixtures create both first.
 */
describe('PrismaMembershipRepository', () => {
  let prisma: PrismaMasterService;
  let repository: PrismaMembershipRepository;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    repository = new PrismaMembershipRepository(prisma);
  });

  afterEach(async () => {
    await prisma.membership.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUserAndCompany(): Promise<{ userId: string; companyId: string }> {
    const user = await prisma.user.create({
      data: { login: `spec.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Membership Spec User' },
    });
    const company = await prisma.company.create({
      data: { name: 'Tienda Membership Spec', slug: `membership-spec-${randomUUID()}` },
    });
    return { userId: user.id, companyId: company.id };
  }

  it('create() persists a Membership defaulting to ACTIVE', async () => {
    const { userId, companyId } = await createUserAndCompany();

    const membership = await repository.create({ userId, companyId });

    expect(membership.id).toEqual(expect.any(String));
    expect(membership.userId).toBe(userId);
    expect(membership.companyId).toBe(companyId);
    expect(membership.status).toBe('ACTIVE');
  });

  it('create() persists an explicit non-ACTIVE status', async () => {
    const { userId, companyId } = await createUserAndCompany();

    const membership = await repository.create({ userId, companyId, status: 'SUSPENDED' });

    expect(membership.status).toBe('SUSPENDED');
  });

  it('findByUserAndCompany() round-trips a persisted Membership', async () => {
    const { userId, companyId } = await createUserAndCompany();
    await repository.create({ userId, companyId });

    const found = await repository.findByUserAndCompany(userId, companyId);

    expect(found).not.toBeNull();
    expect(found?.userId).toBe(userId);
    expect(found?.companyId).toBe(companyId);
  });

  it('findByUserAndCompany() returns null when no Membership exists for the pair', async () => {
    const { userId, companyId } = await createUserAndCompany();

    const found = await repository.findByUserAndCompany(userId, companyId);

    expect(found).toBeNull();
  });

  it('listActiveByUserId() returns the sole ACTIVE Membership for a user', async () => {
    const { userId, companyId } = await createUserAndCompany();
    await repository.create({ userId, companyId, status: 'ACTIVE' });

    const found = await repository.listActiveByUserId(userId);

    expect(found).toHaveLength(1);
    expect(found[0].companyId).toBe(companyId);
  });

  it('listActiveByUserId() returns empty when the only Membership is not ACTIVE', async () => {
    const { userId, companyId } = await createUserAndCompany();
    await repository.create({ userId, companyId, status: 'REVOKED' });

    const found = await repository.listActiveByUserId(userId);

    expect(found).toEqual([]);
  });

  it('listActiveByUserId() returns EVERY ACTIVE Membership, never just the first', async () => {
    // The ambiguity the guard has to detect only exists if the repository
    // reports it. A `findFirst` here would hand back one arbitrary company
    // and the guard could not tell an unambiguous request from an ambiguous
    // one.
    const { userId, companyId } = await createUserAndCompany();
    const second = await createUserAndCompany();
    await repository.create({ userId, companyId, status: 'ACTIVE' });
    await repository.create({ userId, companyId: second.companyId, status: 'ACTIVE' });

    const found = await repository.listActiveByUserId(userId);

    expect(found).toHaveLength(2);
    expect(found.map((m) => m.companyId).sort()).toEqual([companyId, second.companyId].sort());
  });

  it('listByCompany() returns every Membership for a company', async () => {
    const { userId, companyId } = await createUserAndCompany();
    const other = await prisma.user.create({
      data: { login: `spec.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Second User' },
    });
    await repository.create({ userId, companyId });
    await repository.create({ userId: other.id, companyId });

    const memberships = await repository.listByCompany(companyId);

    expect(memberships).toHaveLength(2);
  });

  it('listByCompany() returns an empty array when the company has no Membership', async () => {
    const { companyId } = await createUserAndCompany();

    const memberships = await repository.listByCompany(companyId);

    expect(memberships).toEqual([]);
  });
});
