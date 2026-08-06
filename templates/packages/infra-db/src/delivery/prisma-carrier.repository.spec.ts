import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCarrierRepository } from './prisma-carrier.repository.js';

/**
 * Real Postgres, against a provisioned tenant schema (design.md §4, P12
 * Option C), mirroring `PrismaWarehouseRepository`'s spec discipline —
 * `Carrier` is flat tenant master data with the same soft-delete contract.
 */
describe('PrismaCarrierRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaCarrierRepository;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaCarrierRepository(tenantContext);
  });

  afterEach(async () => {
    await tenantContext.getClient().carrier.deleteMany({});
  });

  it('creates a carrier with required name only, defaulting phone to null and active to true', async () => {
    const created = await repository.create({ name: 'Transportes del Valle' });

    expect(created.name).toBe('Transportes del Valle');
    expect(created.phone).toBeNull();
    expect(created.active).toBe(true);

    const reread = await repository.findById(created.id);
    expect(reread).not.toBeNull();
    expect(reread!.name).toBe('Transportes del Valle');
    // No `assertAbsentFromPublicSchema` call here: unlike `commission_accrual`,
    // `carrier` has no pre-split legacy counterpart in `public` — this table
    // is new to this SDD change, so there is nothing to guard against.
  });

  it('creates a carrier with a phone when one is given', async () => {
    const created = await repository.create({ name: 'Envíos Rápidos', phone: '+53 5 555 1234' });

    expect(created.phone).toBe('+53 5 555 1234');
  });

  it('finds by id and returns null for an unknown one', async () => {
    const created = await repository.create({ name: 'Carrier A' });

    expect((await repository.findById(created.id))!.name).toBe('Carrier A');
    expect(await repository.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('updates the name and phone without touching active/id', async () => {
    const created = await repository.create({ name: 'Original', phone: null });

    const updated = await repository.update(created.id, { name: 'Renamed', phone: '+1 111' });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Renamed');
    expect(updated.phone).toBe('+1 111');
    expect(updated.active).toBe(true);
  });

  it('soft-deletes: active flips to false, the row remains retrievable, never a hard delete', async () => {
    const created = await repository.create({ name: 'Deletable Carrier' });

    await repository.softDelete(created.id);

    const reread = await repository.findById(created.id);
    expect(reread).not.toBeNull();
    expect(reread!.active).toBe(false);
  });

  describe('list', () => {
    it('with no filter returns both active and inactive carriers', async () => {
      const active = await repository.create({ name: 'Active Carrier' });
      const inactive = await repository.create({ name: 'Inactive Carrier' });
      await repository.softDelete(inactive.id);

      const all = await repository.list();

      expect(all.map((c) => c.id).sort()).toEqual([active.id, inactive.id].sort());
    });

    it('with activeOnly:true excludes soft-deleted carriers', async () => {
      const active = await repository.create({ name: 'Active Carrier 2' });
      const inactive = await repository.create({ name: 'Inactive Carrier 2' });
      await repository.softDelete(inactive.id);

      const onlyActive = await repository.list({ activeOnly: true });

      expect(onlyActive.map((c) => c.id)).toEqual([active.id]);
    });
  });
});
