import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { schemaNameFor } from './schema-name.js';
import { TenantPrismaFactory } from './tenant-prisma-factory.js';

/**
 * A tenant client's search_path must contain the tenant schema and NOTHING
 * else. Postgres resolves an unqualified table name against each schema in
 * the search_path in order, so a trailing `public` turns a missing tenant
 * table into a silent read of whatever `public` happens to hold — the
 * legacy business tables today, the master tables (`User`, `Company`,
 * `Membership`) after task 14.2's reset. That is a cross-boundary read that
 * returns rows instead of raising, which is precisely the failure mode
 * spec salesops-tenancy "Tenant Client Acquisition Fails Loud, Never Falls
 * Back" exists to prevent.
 *
 * This spec proves the fallback is absent by planting a probe table that
 * exists ONLY in `public` and requiring the tenant client to fail to see it.
 */
describe('tenant client search_path isolation', () => {
  const PROBE_TABLE = 'search_path_leak_probe';
  const schemaName = schemaNameFor(randomUUID());
  let factory: TenantPrismaFactory;
  let admin: PgClient;

  beforeAll(async () => {
    admin = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
    await admin.connect();
    await admin.query(`CREATE TABLE IF NOT EXISTS public."${PROBE_TABLE}" (id integer)`);
    await admin.query(`INSERT INTO public."${PROBE_TABLE}" (id) VALUES (1)`);
    // Deliberately EMPTY — no tenant DDL applied. The probe table is the
    // only place this name exists, so any successful read proves a fallback.
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    factory = new TenantPrismaFactory();
  });

  afterAll(async () => {
    await factory?.onModuleDestroy();
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.query(`DROP TABLE IF EXISTS public."${PROBE_TABLE}"`);
    await admin.end();
  });

  it('does not resolve a table that exists only in public', async () => {
    const client = factory.getClient(schemaName);

    await expect(client.$queryRawUnsafe(`SELECT id FROM "${PROBE_TABLE}"`)).rejects.toThrow();
  });

  it('reports a search_path holding the tenant schema alone', async () => {
    const client = factory.getClient(schemaName);

    const rows = await client.$queryRawUnsafe<{ search_path: string }[]>(
      'SHOW search_path',
    );

    expect(rows[0].search_path).toBe(`"${schemaName}"`);
  });
});
