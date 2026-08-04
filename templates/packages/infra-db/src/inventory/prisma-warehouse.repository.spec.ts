import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaWarehouseRepository } from './prisma-warehouse.repository.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`.
 */
describe('PrismaWarehouseRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaWarehouseRepository;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaWarehouseRepository(tenantContext);
  });

  afterEach(async () => {
    const prisma = tenantContext.getClient();
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  it('create() persists a Warehouse with a real DB-generated UUID id, scoped to the tenant schema alone', async () => {
    const created = await repository.create({ name: 'Pinar del Río' });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.name).toBe('Pinar del Río');
    expect(created.active).toBe(true);
    // The trap this batch's instructions call out by name: a spec that never
    // provisions a tenant schema, or that reaches a master/default client,
    // can still pass for the wrong reason. `public` still holds a same-named
    // legacy `warehouse` table until task 14.2's reset.
    await assertAbsentFromPublicSchema('warehouse', 'id', created.id);
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
