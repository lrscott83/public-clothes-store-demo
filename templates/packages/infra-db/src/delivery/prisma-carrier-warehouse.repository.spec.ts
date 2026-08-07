import {
  CarrierNotFoundError,
  CoverageAlreadyDeclaredError,
  CoverageWarehouseNotFoundError,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCarrierRepository } from './prisma-carrier.repository.js';
import {
  PrismaCarrierWarehouseRepository,
  translateAddConstraintError,
} from './prisma-carrier-warehouse.repository.js';

/** Builds the exact error shape the driver adapter produces — `meta.target` is EMPTY, the constraint name lives under `driverAdapterError`. */
function driverAdapterError(code: string, index: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('constraint violation', {
    code,
    clientVersion: 'spec',
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

/**
 * Real Postgres, against a provisioned tenant schema. Covers the
 * `@@unique([carrierId, warehouseId])` enforcement and the 0/1/N coverage
 * cardinality per carrier (design §7, spec: "A carrier can cover multiple
 * warehouses").
 */
describe('PrismaCarrierWarehouseRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let carrierRepository: PrismaCarrierRepository;
  let repository: PrismaCarrierWarehouseRepository;
  let carrierId: string;
  let warehouseAId: string;
  let warehouseBId: string;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    carrierRepository = new PrismaCarrierRepository(tenantContext);
    repository = new PrismaCarrierWarehouseRepository(tenantContext);
  });

  beforeEach(async () => {
    const carrier = await carrierRepository.create({ name: 'Coverage Carrier' });
    carrierId = carrier.id;
    const warehouseA = await tenantContext.getClient().warehouse.create({ data: { name: 'Almacén A' } });
    const warehouseB = await tenantContext.getClient().warehouse.create({ data: { name: 'Almacén B' } });
    warehouseAId = warehouseA.id;
    warehouseBId = warehouseB.id;
  });

  afterEach(async () => {
    await tenantContext.getClient().carrierWarehouse.deleteMany({});
    await tenantContext.getClient().carrier.deleteMany({});
    await tenantContext.getClient().warehouse.deleteMany({});
  });

  it('listByCarrier returns zero rows for a carrier with no declared coverage', async () => {
    expect(await repository.listByCarrier(carrierId)).toHaveLength(0);
  });

  it('add creates a coverage row, listByCarrier returns exactly one', async () => {
    await repository.add({ carrierId, warehouseId: warehouseAId });

    const coverage = await repository.listByCarrier(carrierId);

    expect(coverage).toHaveLength(1);
    expect(coverage[0]!.warehouseId).toBe(warehouseAId);
  });

  it('add for N warehouses: listByCarrier returns all of them', async () => {
    await repository.add({ carrierId, warehouseId: warehouseAId });
    await repository.add({ carrierId, warehouseId: warehouseBId });

    const coverage = await repository.listByCarrier(carrierId);

    expect(coverage.map((c) => c.warehouseId).sort()).toEqual([warehouseAId, warehouseBId].sort());
  });

  it('enforces @@unique([carrierId, warehouseId]): adding the same pair twice rejects as CoverageAlreadyDeclaredError', async () => {
    await repository.add({ carrierId, warehouseId: warehouseAId });

    // The UNIQUE index is still the enforcement — this only reports it in the
    // domain's own vocabulary, so the coverage endpoint answers 409 instead
    // of leaking a raw Prisma P2002 as a 500.
    await expect(repository.add({ carrierId, warehouseId: warehouseAId })).rejects.toThrow(
      CoverageAlreadyDeclaredError,
    );
  });

  it('rejects an unknown warehouseId as CoverageWarehouseNotFoundError, not raw P2003', async () => {
    await expect(
      repository.add({ carrierId, warehouseId: '9c1e7a30-5b42-4f88-a1d6-77e0c3b45912' }),
    ).rejects.toThrow(CoverageWarehouseNotFoundError);
  });

  it('rejects an unknown carrierId as CarrierNotFoundError, not raw P2003', async () => {
    await expect(
      repository.add({
        carrierId: '9c1e7a30-5b42-4f88-a1d6-77e0c3b45912',
        warehouseId: warehouseAId,
      }),
    ).rejects.toThrow(CarrierNotFoundError);
  });

  it('remove deletes the coverage row; listByCarrier no longer returns it', async () => {
    await repository.add({ carrierId, warehouseId: warehouseAId });

    await repository.remove(carrierId, warehouseAId);

    expect(await repository.listByCarrier(carrierId)).toHaveLength(0);
  });

  it('remove is a no-op when the pair does not exist', async () => {
    await expect(repository.remove(carrierId, warehouseAId)).resolves.not.toThrow();
    expect(await repository.listByCarrier(carrierId)).toHaveLength(0);
  });

  describe('listByWarehouse — the inverse read (one query instead of one per carrier)', () => {
    it('returns every carrier covering the warehouse, and nothing else', async () => {
      const otherCarrier = await carrierRepository.create({ name: 'Other Coverage Carrier' });
      await repository.add({ carrierId, warehouseId: warehouseAId });
      await repository.add({ carrierId, warehouseId: warehouseBId });
      await repository.add({ carrierId: otherCarrier.id, warehouseId: warehouseAId });

      const coveringA = await repository.listByWarehouse(warehouseAId);

      expect(coveringA.map((c) => c.carrierId).sort()).toEqual([carrierId, otherCarrier.id].sort());
      expect(coveringA.every((c) => c.warehouseId === warehouseAId)).toBe(true);
    });

    it('returns zero rows for a warehouse nobody covers', async () => {
      await repository.add({ carrierId, warehouseId: warehouseAId });

      expect(await repository.listByWarehouse(warehouseBId)).toHaveLength(0);
    });
  });

  /**
   * CLASS B — the translator must decide from the CONSTRAINT that was
   * violated, not from a substring that happens to disambiguate today.
   *
   * These drive the translator directly with synthesized driver-adapter error
   * shapes because the real `add` path cannot produce a `carrier_warehouse_pkey`
   * collision (the adapter never writes `id`; the DB defaults it), and that
   * un-producible case is exactly the one the old `if (code === 'P2002')`
   * catch-all mistranslated.
   */
  describe('translateAddConstraintError — gated on the constraint, not on a substring', () => {
    const CARRIER = '11111111-1111-1111-1111-111111111111';
    const WAREHOUSE = '22222222-2222-2222-2222-222222222222';

    it('maps P2002 on the coverage UNIQUE index to CoverageAlreadyDeclaredError', () => {
      const translated = translateAddConstraintError(
        driverAdapterError('P2002', 'carrier_warehouse_carrier_id_warehouse_id_key'),
        CARRIER,
        WAREHOUSE,
      );
      expect(translated).toBeInstanceOf(CoverageAlreadyDeclaredError);
    });

    it('does NOT claim a P2002 on some OTHER unique index is a duplicate coverage', () => {
      const original = driverAdapterError('P2002', 'carrier_warehouse_pkey');

      const translated = translateAddConstraintError(original, CARRIER, WAREHOUSE);

      expect(translated).toBe(original);
      expect(translated).not.toBeInstanceOf(CoverageAlreadyDeclaredError);
    });

    it('maps P2003 on the warehouse FK by its constraint name', () => {
      const translated = translateAddConstraintError(
        driverAdapterError('P2003', 'carrier_warehouse_warehouse_id_fkey'),
        CARRIER,
        WAREHOUSE,
      );
      expect(translated).toBeInstanceOf(CoverageWarehouseNotFoundError);
    });

    it('maps P2003 on the carrier FK by its constraint name', () => {
      const translated = translateAddConstraintError(
        driverAdapterError('P2003', 'carrier_warehouse_carrier_id_fkey'),
        CARRIER,
        WAREHOUSE,
      );
      expect(translated).toBeInstanceOf(CarrierNotFoundError);
    });

    /**
     * The old code tested `includes('warehouse_id')` before
     * `includes('carrier_id')`, so the carrier branch was only ever reachable
     * because `carrier_warehouse_carrier_id_fkey` happens not to contain the
     * substring `warehouse_id`. Matching the FULL constraint names makes the
     * two branches mutually exclusive by construction — and makes a
     * constraint this translator does not recognise fall through untranslated
     * instead of being claimed by whichever branch runs first.
     */
    it('leaves a P2003 on an FK it does not recognise untranslated', () => {
      const original = driverAdapterError('P2003', 'some_other_table_carrier_id_fkey');

      const translated = translateAddConstraintError(original, CARRIER, WAREHOUSE);

      expect(translated).toBe(original);
    });

    it('passes an unrelated Prisma code straight through', () => {
      const original = driverAdapterError('P2025', 'carrier_warehouse_pkey');
      expect(translateAddConstraintError(original, CARRIER, WAREHOUSE)).toBe(original);
    });

    it('passes a non-Prisma error straight through', () => {
      const original = new Error('kaboom');
      expect(translateAddConstraintError(original, CARRIER, WAREHOUSE)).toBe(original);
    });
  });
});
