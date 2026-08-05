import { seedWarehouses, WAREHOUSE_NAMES } from './seed.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';

/**
 * Real Postgres, against a provisioned tenant schema (task 5.1) — `Warehouse`
 * is tenant-side (design.md §1). Covers the spec's "Seed produces 3 active
 * warehouses" and "No StockLevel rows are seeded" scenarios, plus
 * idempotency (re-running never duplicates). Row-level cleanup between
 * `it`s, not a fresh schema per test — the schema itself is dropped once in
 * `afterAll` by `useTenantSchema()`.
 */
describe('seedWarehouses', () => {
  const getTenantSchema = useTenantSchema();

  afterEach(async () => {
    const { client } = getTenantSchema();
    await client.stockMovement.deleteMany({});
    await client.stockLevel.deleteMany({});
    await client.warehouse.deleteMany({});
  });

  it('produces exactly 3 active Warehouse rows with the MVP names', async () => {
    const { client } = getTenantSchema();
    await seedWarehouses(client);

    const warehouses = await client.warehouse.findMany();
    expect(warehouses).toHaveLength(3);
    expect(warehouses.every((w) => w.active)).toBe(true);
    expect(warehouses.map((w) => w.name).sort()).toEqual([...WAREHOUSE_NAMES].sort());
  });

  it('seeds ZERO StockLevel rows', async () => {
    const { client } = getTenantSchema();
    await seedWarehouses(client);

    const levels = await client.stockLevel.findMany();
    expect(levels).toHaveLength(0);
  });

  it('is idempotent: running the seed twice yields exactly 3 rows, never duplicates', async () => {
    const { client } = getTenantSchema();
    await seedWarehouses(client);
    await seedWarehouses(client);

    const warehouses = await client.warehouse.findMany();
    expect(warehouses).toHaveLength(3);
  });
});
