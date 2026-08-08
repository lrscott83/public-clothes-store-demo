import { Client as PgClient } from 'pg';
import { useTenantSchema } from './tenant-schema.spec-helper.js';

/**
 * Proves `useTenantSchema()` itself — the helper Phase 6's ~12 repository
 * specs and Phase 13's isolation proof will depend on — actually does what
 * its doc comment claims, against the real `store_mgmt_test` database (same
 * no-mock discipline as every other `infra-db` spec):
 *
 * 1. the schema exists and carries the tenant DDL once `beforeAll` has run
 * 2. `public` gains no new tables as a side effect (search_path wiring is correct)
 * 3. the returned client is genuinely scoped to that schema (not `public`)
 * 4. the schema is gone once `afterAll` has run — proven from OUTSIDE the
 *    nested `describe`, after its own `afterAll` has already executed,
 *    since Jest runs sibling blocks in declaration order.
 */
describe('useTenantSchema()', () => {
  let capturedSchemaName: string | undefined;

  async function tablesIn(client: PgClient, schemaName: string): Promise<string[]> {
    const { rows } = await client.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
      [schemaName],
    );
    return rows.map((r: { tablename: string }) => r.tablename);
  }

  describe('while the suite is running', () => {
    const getTenantSchema = useTenantSchema();
    let verifyClient: PgClient;
    let publicTablesBefore: string[];

    beforeAll(async () => {
      verifyClient = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
      await verifyClient.connect();
      publicTablesBefore = await tablesIn(verifyClient, 'public');
    });

    afterAll(async () => {
      await verifyClient.end();
    });

    it('creates the schema and applies the tenant DDL scoped to it', async () => {
      const { schemaName } = getTenantSchema();
      capturedSchemaName = schemaName;

      const tenantTables = await tablesIn(verifyClient, schemaName);
      expect(tenantTables).toEqual(
        expect.arrayContaining(['category', 'product', 'customer', 'company_user']),
      );
    });

    it('does not create any tenant tables in public', async () => {
      const publicTablesAfter = await tablesIn(verifyClient, 'public');
      expect(publicTablesAfter).toEqual(publicTablesBefore);
    });

    it('returns a client whose search_path holds the tenant schema alone', async () => {
      const { schemaName, client } = getTenantSchema();

      const rows = await client.$queryRawUnsafe<{ search_path: string }[]>('SHOW search_path');

      expect(rows[0].search_path).toBe(`"${schemaName}"`);
    });
  });

  it('drops the schema once the suite (and its afterAll) has finished', async () => {
    expect(capturedSchemaName).toBeDefined();

    const verifyClient = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
    await verifyClient.connect();
    try {
      const { rows } = await verifyClient.query(
        'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1',
        [capturedSchemaName],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await verifyClient.end();
    }
  });
});
