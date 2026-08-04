import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { schemaNameFor } from './schema-name.js';
import { TenantDatabaseService } from './tenant-database.service.js';

/**
 * Integration test against the real `store_mgmt_test` database (no mocks —
 * same discipline as every other `infra-db` spec). `store_mgmt_test`'s
 * `public` schema still carries the FULL legacy pre-split table set —
 * `category`, `product`, `customer`, `company_user`, etc. (task 3.5's
 * discovery) — and those are the SAME table names `prisma/tenant-schema.sql`
 * creates. That overlap makes this a real proof, not a tautology: if
 * `createSchema` ever fails to `SET search_path` to the new tenant schema
 * BEFORE applying the DDL, Postgres tries to create `"category"` /
 * `"product"` / ... in `public`, collides with the legacy tables already
 * there, and the call throws — this suite would fail loudly instead of
 * silently provisioning into `public` (design.md D6/D7 — "the single most
 * important correctness point" of this phase).
 *
 * Not explicitly listed as a RED spec in tasks.md 4.1 (only
 * tenant-prisma-factory.spec.ts / tenant-context.service.spec.ts are), but
 * tasks.md's own "Hard constraint #1" for this phase demands proof of the
 * search_path behavior, not just an implementation nobody exercises — so
 * this file is written RED-first the same way, as a scope enhancement of
 * 4.1/4.2, not a new task.
 */
describe('TenantDatabaseService', () => {
  let verifyClient: PgClient;
  let service: TenantDatabaseService;
  const createdSchemas: string[] = [];

  beforeAll(async () => {
    verifyClient = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
    await verifyClient.connect();
    service = new TenantDatabaseService();
  });

  afterEach(async () => {
    // Test hygiene: never leave a tenant schema behind, success or failure.
    while (createdSchemas.length > 0) {
      const schemaName = createdSchemas.pop()!;
      await service.deleteSchema(schemaName);
    }
  });

  afterAll(async () => {
    await verifyClient.end();
  });

  function newSchemaName(): string {
    const name = schemaNameFor(randomUUID());
    createdSchemas.push(name);
    return name;
  }

  async function tablesIn(schemaName: string): Promise<string[]> {
    const { rows } = await verifyClient.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
      [schemaName],
    );
    return rows.map((r: { tablename: string }) => r.tablename);
  }

  it('createSchema() creates the schema and applies the tenant DDL scoped to it', async () => {
    const schemaName = newSchemaName();

    await service.createSchema(schemaName);

    const tenantTables = await tablesIn(schemaName);
    expect(tenantTables).toEqual(
      expect.arrayContaining(['category', 'product', 'customer', 'company_user', 'sales_order']),
    );
  });

  it('createSchema() does not touch public — no duplicate tables land there', async () => {
    const schemaName = newSchemaName();
    const publicTablesBefore = await tablesIn('public');

    await service.createSchema(schemaName);

    const publicTablesAfter = await tablesIn('public');
    expect(publicTablesAfter).toEqual(publicTablesBefore);
  });

  it('createSchema() rejects an invalid schema name before issuing any SQL', async () => {
    await expect(service.createSchema('not-a-real-tenant-schema')).rejects.toThrow();
  });

  it('schemaExists() reflects creation and deletion', async () => {
    const schemaName = newSchemaName();
    await expect(service.schemaExists(schemaName)).resolves.toBe(false);

    await service.createSchema(schemaName);
    await expect(service.schemaExists(schemaName)).resolves.toBe(true);

    await service.deleteSchema(schemaName);
    createdSchemas.pop(); // already dropped — afterEach must not double-drop
    await expect(service.schemaExists(schemaName)).resolves.toBe(false);
  });

  it('deleteSchema() drops the schema and everything in it (CASCADE)', async () => {
    const schemaName = newSchemaName();
    await service.createSchema(schemaName);

    await service.deleteSchema(schemaName);

    await expect(service.schemaExists(schemaName)).resolves.toBe(false);
    createdSchemas.pop();
  });

  it('deleteSchema() on a schema that never existed does not throw (IF EXISTS)', async () => {
    const schemaName = schemaNameFor(randomUUID());
    await expect(service.deleteSchema(schemaName)).resolves.toBeUndefined();
  });
});
