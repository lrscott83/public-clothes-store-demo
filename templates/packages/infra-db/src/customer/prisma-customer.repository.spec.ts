import { PrismaService } from '../prisma-client.js';
import { PrismaCustomerRepository } from './prisma-customer.repository.js';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-warehouse.repository.spec.ts`.
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a Customer with a real DB-generated UUID id and null contacts', async () => {
    const created = await repository.create({ fullName: 'Ana Torres' });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.fullName).toBe('Ana Torres');
    expect(created.documentId).toBeNull();
    expect(created.cellPhone).toBeNull();
    expect(created.email).toBeNull();
    expect(created.address).toBeNull();
    expect(created.note).toBeNull();
    expect(created.active).toBe(true);
  });

  it('findById() round-trips a persisted Customer', async () => {
    const created = await repository.create({ fullName: 'Luis Pérez', email: 'luis@example.com' });

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.fullName).toBe('Luis Pérez');
    expect(found?.email).toBe('luis@example.com');
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('update() persists a partial patch', async () => {
    const created = await repository.create({ fullName: 'Marta Gómez' });

    const updated = await repository.update(created.id, { cellPhone: '555-1234' });

    expect(updated.cellPhone).toBe('555-1234');
    expect(updated.fullName).toBe('Marta Gómez');
  });

  it('softDelete() flips active=false, row still findById-able', async () => {
    const created = await repository.create({ fullName: 'José Díaz' });

    await repository.softDelete(created.id);

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('list() excludes inactive customers by default, includes them with includeInactive', async () => {
    const active = await repository.create({ fullName: 'Yanet Cruz' });
    const inactive = await repository.create({ fullName: 'Temporal' });
    await repository.softDelete(inactive.id);

    const defaultList = await repository.list();
    expect(defaultList.map((c) => c.id)).toContain(active.id);
    expect(defaultList.map((c) => c.id)).not.toContain(inactive.id);

    const fullList = await repository.list({ includeInactive: true });
    expect(fullList.map((c) => c.id)).toContain(inactive.id);
  });

  it('allows many customers with a null documentId to coexist', async () => {
    const a = await repository.create({ fullName: 'Null Doc A' });
    const b = await repository.create({ fullName: 'Null Doc B' });

    expect(a.documentId).toBeNull();
    expect(b.documentId).toBeNull();
  });

  it('rejects a duplicate non-null documentId on create with DuplicateCustomerDocumentError', async () => {
    const { DuplicateCustomerDocumentError } = await import('@store-mgmt/domain');
    await repository.create({ fullName: 'Doc Owner', documentId: 'D1' });

    await expect(repository.create({ fullName: 'Doc Impostor', documentId: 'D1' })).rejects.toThrow(
      DuplicateCustomerDocumentError,
    );
  });

  it('rejects updating a customer to an existing documentId with DuplicateCustomerDocumentError', async () => {
    const { DuplicateCustomerDocumentError } = await import('@store-mgmt/domain');
    await repository.create({ fullName: 'Doc Owner 2', documentId: 'D2' });
    const b = await repository.create({ fullName: 'No Doc' });

    await expect(repository.update(b.id, { documentId: 'D2' })).rejects.toThrow(
      DuplicateCustomerDocumentError,
    );
  });

  it('allows a customer to keep its own documentId on update (no self-collision)', async () => {
    const created = await repository.create({ fullName: 'Self Keeper', documentId: 'D3' });

    const updated = await repository.update(created.id, {
      documentId: 'D3',
      cellPhone: '555-9999',
    });

    expect(updated.documentId).toBe('D3');
    expect(updated.cellPhone).toBe('555-9999');
  });
});
