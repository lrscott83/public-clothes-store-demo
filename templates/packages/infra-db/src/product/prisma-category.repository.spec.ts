import { PrismaService } from '../prisma-client.js';
import { PrismaCategoryRepository } from './prisma-category.repository.js';
import { PrismaProductRepository } from './prisma-product.repository.js';
import { wipeCommissionTables } from '../commission/commission-fixtures.spec-helper.js';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-currency.repository.spec.ts`.
 */
describe('PrismaCategoryRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaCategoryRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaCategoryRepository(prisma);
  });

  afterEach(async () => {
    // First: commission rows RESTRICT the product delete below.
    await wipeCommissionTables(prisma);
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a Category with a real DB-generated UUID id', async () => {
    const created = await repository.create({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.slug).toBe('cafeteras');
    expect(created.active).toBe(true);
  });

  it('rejects a duplicate slug on create() — unique constraint surfaces as an error, never a silent overwrite', async () => {
    await repository.create({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

    await expect(
      repository.create({ name: 'Cafeteras Dup', slug: 'cafeteras', order: 2 }),
    ).rejects.toThrow();
  });

  it('findBySlug() round-trips a persisted category', async () => {
    const created = await repository.create({ name: 'Climatizacion', slug: 'climatizacion', order: 2 });

    const found = await repository.findBySlug('climatizacion');

    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe('Climatizacion');
  });

  it('findBySlug() returns null for an unknown slug', async () => {
    const found = await repository.findBySlug('no-existe');
    expect(found).toBeNull();
  });

  it('softDelete() flips active=false without deleting the row', async () => {
    const created = await repository.create({ name: 'Cocinas', slug: 'cocinas', order: 3 });

    await repository.softDelete(created.id);

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('list() excludes inactive categories by default, includes them with includeInactive', async () => {
    const active = await repository.create({ name: 'Ollas', slug: 'ollas', order: 4 });
    const inactive = await repository.create({ name: 'Utiles', slug: 'utiles', order: 5 });
    await repository.softDelete(inactive.id);

    const defaultList = await repository.list();
    expect(defaultList.map((c) => c.id)).toContain(active.id);
    expect(defaultList.map((c) => c.id)).not.toContain(inactive.id);

    const fullList = await repository.list({ includeInactive: true });
    expect(fullList.map((c) => c.id)).toContain(inactive.id);
  });

  it('deactivating a category keeps referencing products intact — never orphaned/cascaded', async () => {
    const category = await repository.create({ name: 'Freidoras', slug: 'freidoras', order: 6 });
    const productRepository = new PrismaProductRepository(prisma);
    const product = await productRepository.create({
      name: 'Freidora de aire',
      description: '5 litros',
      price: { minorUnits: 10000n, currency: 'USD' },
      cost: { minorUnits: 6000n, currency: 'USD' },
      categoryId: category.id,
      image: 'freidora.png',
      order: 1,
    });

    await repository.softDelete(category.id);

    const stillFound = await repository.findById(category.id);
    expect(stillFound).not.toBeNull();
    expect(stillFound?.active).toBe(false);

    const productStillLinked = await productRepository.findById(product.id);
    expect(productStillLinked).not.toBeNull();
    expect(productStillLinked?.categoryId).toBe(category.id);
  });
});
