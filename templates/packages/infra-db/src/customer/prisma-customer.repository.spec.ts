import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma-client.js';
import { PrismaCustomerRepository } from './prisma-customer.repository.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-warehouse.repository.spec.ts`. Every
 * `Customer` now requires an existing `User` via `userId` (1:1,
 * backend-users-roles) — `createTestUser` mints a fresh one per call.
 */
describe('PrismaCustomerRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaCustomerRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaCustomerRepository(prisma);
  });

  afterEach(async () => {
    await prisma.customer.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createTestUser(fullName: string): Promise<string> {
    const user = await prisma.user.create({
      data: { login: `spec.${randomUUID()}`, passwordHash: VALID_HASH, fullName },
    });
    return user.id;
  }

  it('create() persists a Customer with a real DB-generated UUID id and null contacts', async () => {
    const userId = await createTestUser('Ana Torres');
    const created = await repository.create({ fullName: 'Ana Torres', userId });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.fullName).toBe('Ana Torres');
    expect(created.userId).toBe(userId);
    expect(created.documentId).toBeNull();
    expect(created.cellPhone).toBeNull();
    expect(created.email).toBeNull();
    expect(created.address).toBeNull();
    expect(created.note).toBeNull();
    expect(created.active).toBe(true);
  });

  it('findById() round-trips a persisted Customer', async () => {
    const userId = await createTestUser('Luis Pérez');
    const created = await repository.create({ fullName: 'Luis Pérez', userId, email: 'luis@example.com' });

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.fullName).toBe('Luis Pérez');
    expect(found?.email).toBe('luis@example.com');
    expect(found?.userId).toBe(userId);
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('update() persists a partial patch', async () => {
    const userId = await createTestUser('Marta Gómez');
    const created = await repository.create({ fullName: 'Marta Gómez', userId });

    const updated = await repository.update(created.id, { cellPhone: '555-1234' });

    expect(updated.cellPhone).toBe('555-1234');
    expect(updated.fullName).toBe('Marta Gómez');
  });

  it('softDelete() flips active=false, row still findById-able', async () => {
    const userId = await createTestUser('José Díaz');
    const created = await repository.create({ fullName: 'José Díaz', userId });

    await repository.softDelete(created.id);

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('list() excludes inactive customers by default, includes them with includeInactive', async () => {
    const activeUserId = await createTestUser('Yanet Cruz');
    const inactiveUserId = await createTestUser('Temporal');
    const active = await repository.create({ fullName: 'Yanet Cruz', userId: activeUserId });
    const inactive = await repository.create({ fullName: 'Temporal', userId: inactiveUserId });
    await repository.softDelete(inactive.id);

    const defaultList = await repository.list();
    expect(defaultList.map((c) => c.id)).toContain(active.id);
    expect(defaultList.map((c) => c.id)).not.toContain(inactive.id);

    const fullList = await repository.list({ includeInactive: true });
    expect(fullList.map((c) => c.id)).toContain(inactive.id);
  });

  it('allows many customers with a null documentId to coexist', async () => {
    const userIdA = await createTestUser('Null Doc A');
    const userIdB = await createTestUser('Null Doc B');
    const a = await repository.create({ fullName: 'Null Doc A', userId: userIdA });
    const b = await repository.create({ fullName: 'Null Doc B', userId: userIdB });

    expect(a.documentId).toBeNull();
    expect(b.documentId).toBeNull();
  });

  it('rejects a duplicate non-null documentId on create with DuplicateCustomerDocumentError', async () => {
    const { DuplicateCustomerDocumentError } = await import('@store-mgmt/domain');
    const userIdA = await createTestUser('Doc Owner');
    const userIdB = await createTestUser('Doc Impostor');
    await repository.create({ fullName: 'Doc Owner', userId: userIdA, documentId: 'D1' });

    await expect(
      repository.create({ fullName: 'Doc Impostor', userId: userIdB, documentId: 'D1' }),
    ).rejects.toThrow(DuplicateCustomerDocumentError);
  });

  it('rejects updating a customer to an existing documentId with DuplicateCustomerDocumentError', async () => {
    const { DuplicateCustomerDocumentError } = await import('@store-mgmt/domain');
    const userIdA = await createTestUser('Doc Owner 2');
    const userIdB = await createTestUser('No Doc');
    await repository.create({ fullName: 'Doc Owner 2', userId: userIdA, documentId: 'D2' });
    const b = await repository.create({ fullName: 'No Doc', userId: userIdB });

    await expect(repository.update(b.id, { documentId: 'D2' })).rejects.toThrow(
      DuplicateCustomerDocumentError,
    );
  });

  it('allows a customer to keep its own documentId on update (no self-collision)', async () => {
    const userId = await createTestUser('Self Keeper');
    const created = await repository.create({ fullName: 'Self Keeper', userId, documentId: 'D3' });

    const updated = await repository.update(created.id, {
      documentId: 'D3',
      cellPhone: '555-9999',
    });

    expect(updated.documentId).toBe('D3');
    expect(updated.cellPhone).toBe('555-9999');
  });

  it('rejects creating a customer whose userId does not reference an existing User, with CustomerUserNotFoundError', async () => {
    const { CustomerUserNotFoundError } = await import('@store-mgmt/domain');

    await expect(
      repository.create({ fullName: 'Ghost User', userId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(CustomerUserNotFoundError);
  });

  it('rejects a second Customer with the same userId, with DuplicateCustomerUserError (1:1)', async () => {
    const { DuplicateCustomerUserError } = await import('@store-mgmt/domain');
    const userId = await createTestUser('Shared User');
    await repository.create({ fullName: 'First Owner', userId });

    await expect(repository.create({ fullName: 'Second Owner', userId })).rejects.toThrow(
      DuplicateCustomerUserError,
    );
  });
});
