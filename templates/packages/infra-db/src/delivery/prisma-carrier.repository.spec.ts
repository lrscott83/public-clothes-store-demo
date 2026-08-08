import { CarrierHasOpenAssignmentsError, CarrierNotFoundError } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import {
  createDeliveryOrderFixture,
  seedDeliveryFixtureBase,
  wipeDeliveryFixture,
  type DeliveryFixtureBase,
} from './delivery-fixtures.spec-helper.js';
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

  it('honours an explicit active:false on create — the default is applied, never forced', async () => {
    const created = await repository.create({ name: 'Retired Carrier', active: false });

    expect(created.active).toBe(false);
    expect((await repository.findById(created.id))!.active).toBe(false);
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

  /**
   * CLASS B — no Prisma error escapes untranslated. `update`/`softDelete` are
   * `prisma.carrier.update`, which raises P2025 for an unknown id; uncaught,
   * a well-formed-but-unknown uuid answered 500 while the sibling `findById`
   * answered a clean null/404.
   */
  describe('unknown id (P2025) is translated, never leaked', () => {
    const UNKNOWN = '00000000-0000-0000-0000-0000000000ff';

    it('update on an unknown id throws CarrierNotFoundError', async () => {
      await expect(repository.update(UNKNOWN, { name: 'Nope' })).rejects.toThrow(CarrierNotFoundError);
    });

    it('softDelete on an unknown id throws CarrierNotFoundError', async () => {
      await expect(repository.softDelete(UNKNOWN)).rejects.toThrow(CarrierNotFoundError);
    });
  });

  /**
   * CLASS C + CLASS E3 — `active` has TWO writers (`update` and `softDelete`)
   * and one invariant. The guard lives in the adapter, inside one transaction
   * holding a row lock on the carrier, so it cannot be stepped around by a
   * concurrent `assign` (which takes the same lock) nor bypassed by picking
   * the other writer.
   */
  describe('the open-assignment invariant guards EVERY writer of `active`', () => {
    let base: DeliveryFixtureBase;

    beforeEach(async () => {
      base = await seedDeliveryFixtureBase(tenantContext.getClient());
    });

    afterEach(async () => {
      await wipeDeliveryFixture(tenantContext.getClient());
    });

    async function carrierWithOpenAssignment(): Promise<string> {
      const carrier = await repository.create({ name: `Busy ${Date.now()}` });
      const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'delivery',
        status: 'verified',
      });
      await tenantContext.getClient().deliveryAssignment.create({
        data: { orderId, carrierId: carrier.id, status: 'in_transit', assignedAt: new Date() },
      });
      return carrier.id;
    }

    it('softDelete refuses while in_transit assignments remain', async () => {
      const carrierId = await carrierWithOpenAssignment();

      await expect(repository.softDelete(carrierId)).rejects.toThrow(CarrierHasOpenAssignmentsError);
      expect((await repository.findById(carrierId))!.active).toBe(true);
    });

    it('update({active:false}) refuses too — the same column, the same invariant', async () => {
      const carrierId = await carrierWithOpenAssignment();

      await expect(repository.update(carrierId, { active: false })).rejects.toThrow(
        CarrierHasOpenAssignmentsError,
      );
      expect((await repository.findById(carrierId))!.active).toBe(true);
    });

    it('update({name}) on the same carrier still works — the guard fires on `active:false` only', async () => {
      const carrierId = await carrierWithOpenAssignment();

      const updated = await repository.update(carrierId, { name: 'Still Renameable' });

      expect(updated.name).toBe('Still Renameable');
      expect(updated.active).toBe(true);
    });

    it('update({active:true}) is never blocked — reactivation is not a deactivation', async () => {
      const carrierId = await carrierWithOpenAssignment();

      const updated = await repository.update(carrierId, { active: true });

      expect(updated.active).toBe(true);
    });

    it('a delivered or cancelled assignment does NOT block deactivation', async () => {
      const carrier = await repository.create({ name: 'Free Carrier' });
      const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'delivery',
        status: 'delivered',
      });
      await tenantContext.getClient().deliveryAssignment.create({
        data: {
          orderId,
          carrierId: carrier.id,
          status: 'delivered',
          assignedAt: new Date(),
          deliveredAt: new Date(),
        },
      });

      await repository.softDelete(carrier.id);

      expect((await repository.findById(carrier.id))!.active).toBe(false);
    });
  });

  /** CLASS G7 — what is stored is what was validated, on the PATCH path too. */
  describe('field normalization', () => {
    it('trims a padded name on create', async () => {
      const created = await repository.create({ name: '  Envíos Padded  ' });
      expect(created.name).toBe('Envíos Padded');
      expect((await repository.findById(created.id))!.name).toBe('Envíos Padded');
    });

    it('trims a padded name and phone on update', async () => {
      const created = await repository.create({ name: 'Original Trim' });

      const updated = await repository.update(created.id, { name: '  Renamed  ', phone: '  +1 222 ' });

      expect(updated.name).toBe('Renamed');
      expect(updated.phone).toBe('+1 222');
    });
  });
});
