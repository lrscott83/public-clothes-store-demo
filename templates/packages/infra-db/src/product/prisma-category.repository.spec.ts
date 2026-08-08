import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCategoryRepository } from './prisma-category.repository.js';
import { PrismaProductRepository } from './prisma-product.repository.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`.
 */
describe('PrismaCategoryRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaCategoryRepository;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaCategoryRepository(tenantContext);
  });

  afterEach(async () => {
    const prisma = tenantContext.getClient();
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
  });

  it('create() persists a Category with a real DB-generated UUID id, scoped to the tenant schema alone', async () => {
    const created = await repository.create({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.slug).toBe('cafeteras');
    expect(created.active).toBe(true);
    // The trap this batch's instructions call out by name: a spec that never
    // provisions a tenant schema, or that reaches a master/default client,
    // can still pass for the wrong reason. `public` still holds a same-named
    // legacy `category` table until task 14.2's reset.
    await assertAbsentFromPublicSchema('category', 'id', created.id);
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
    const productRepository = new PrismaProductRepository(tenantContext);
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
