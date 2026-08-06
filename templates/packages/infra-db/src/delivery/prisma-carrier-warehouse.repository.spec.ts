import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCarrierRepository } from './prisma-carrier.repository.js';
import { PrismaCarrierWarehouseRepository } from './prisma-carrier-warehouse.repository.js';

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

  it('enforces @@unique([carrierId, warehouseId]): adding the same pair twice rejects', async () => {
    await repository.add({ carrierId, warehouseId: warehouseAId });

    await expect(repository.add({ carrierId, warehouseId: warehouseAId })).rejects.toThrow();
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
});
