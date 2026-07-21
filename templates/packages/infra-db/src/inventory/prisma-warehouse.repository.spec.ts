import { PrismaService } from '../prisma-client.js';
import { PrismaWarehouseRepository } from './prisma-warehouse.repository.js';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-category.repository.spec.ts`.
 */
describe('PrismaWarehouseRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaWarehouseRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaWarehouseRepository(prisma);
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a Warehouse with a real DB-generated UUID id', async () => {
    const created = await repository.create({ name: 'Pinar del Río' });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.name).toBe('Pinar del Río');
    expect(created.active).toBe(true);
  });

  it('softDelete() flips active=false, row still findById-able', async () => {
    const created = await repository.create({ name: 'Consolación del Sur' });

    await repository.softDelete(created.id);

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('list() excludes inactive warehouses by default, includes them with includeInactive', async () => {
    const active = await repository.create({ name: 'Herradura' });
    const inactive = await repository.create({ name: 'Temporal' });
    await repository.softDelete(inactive.id);

    const defaultList = await repository.list();
    expect(defaultList.map((w) => w.id)).toContain(active.id);
    expect(defaultList.map((w) => w.id)).not.toContain(inactive.id);

    const fullList = await repository.list({ includeInactive: true });
    expect(fullList.map((w) => w.id)).toContain(inactive.id);
  });

  it('update() persists a partial patch', async () => {
    const created = await repository.create({ name: 'Old Name' });

    const updated = await repository.update(created.id, { name: 'New Name' });

    expect(updated.name).toBe('New Name');
  });
});
