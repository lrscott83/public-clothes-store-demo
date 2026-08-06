import { seedWarehouses } from '../inventory/seed.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';
import { seedCarriers } from './seed.js';

/**
 * Real Postgres, against a provisioned tenant schema. Covers idempotency
 * (task 3.7: "deterministic carrier/coverage... fixtures") — mirrors
 * `inventory/seed.spec.ts`-style coverage for `seedWarehouses`, adapted for
 * `seedCarriers`' own shape (carriers, no top-level `Carrier.name` unique
 * constraint to lean on, and a coverage join re-run must not duplicate).
 */
describe('seedCarriers', () => {
  const getTenantSchema = useTenantSchema();

  it('creates the demo carriers, with coverage only for the ones the catalog declares it for', async () => {
    const { client } = getTenantSchema();
    await seedWarehouses(client);

    const result = await seedCarriers(client);

    expect(result.carriersUpserted).toBe(2);
    expect(result.coverageRowsUpserted).toBe(2);

    const rapido = await client.carrier.findFirstOrThrow({ where: { name: 'Envíos Rápidos' } });
    const valle = await client.carrier.findFirstOrThrow({ where: { name: 'Transportes del Valle' } });
    expect(await client.carrierWarehouse.count({ where: { carrierId: rapido.id } })).toBe(2);
    expect(await client.carrierWarehouse.count({ where: { carrierId: valle.id } })).toBe(0);
  });

  it('is idempotent: re-running never duplicates carriers or coverage rows', async () => {
    const { client } = getTenantSchema();
    await seedWarehouses(client);
    await seedCarriers(client);

    const second = await seedCarriers(client);

    expect(second.coverageRowsUpserted).toBe(0);
    expect(await client.carrier.count()).toBe(2);
    expect(await client.carrierWarehouse.count()).toBe(2);
  });
});
