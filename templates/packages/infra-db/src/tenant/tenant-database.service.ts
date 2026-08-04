import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { assertSchemaName } from './schema-name.js';

/**
 * Walks upward from `startDir` looking for `prisma/tenant-schema.sql`.
 * Needed because this file's `__dirname` differs by build depth: 2 levels
 * up from `src/tenant` under ts-jest (runs the `.ts` directly), 3 levels up
 * from `dist/src/tenant` once compiled — a fixed `../../..` breaks one of
 * the two. Walking up avoids hard-coding depth for either.
 */
function findTenantSchemaSqlPath(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'prisma', 'tenant-schema.sql');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate prisma/tenant-schema.sql starting from ${startDir}`);
}

/**
 * Provisioning-time primitive (design.md D6/D7): creates/drops a tenant's
 * Postgres schema and applies the generated `prisma/tenant-schema.sql` DDL
 * to it via a raw `pg.Client` (no Prisma migrate in the request path).
 *
 * That DDL is SCHEMA-UNQUALIFIED (`CREATE TABLE "category"`, not
 * `"tenant_x"."category"` — `scripts/generate-tenant-schema-sql.ts`) and a
 * raw `pg.Client` inherits NO search_path from anything. `createSchema`
 * MUST `SET search_path` to the target tenant schema before applying it, or
 * it silently writes into `public` — which, in this repo, already holds a
 * same-named legacy table set (task 3.5's discovery), so getting this wrong
 * does not even fail loudly on an empty database; it collides. This is the
 * single most important correctness point in this phase (design.md D6) —
 * see `tenant-database.service.spec.ts` for the proof.
 */
@Injectable()
export class TenantDatabaseService {
  private readonly tenantSchemaSql: string;

  constructor() {
    this.tenantSchemaSql = fs.readFileSync(findTenantSchemaSqlPath(__dirname), 'utf8');
  }

  /**
   * Creates `schemaName` and applies the tenant DDL to it, atomically: if
   * applying the DDL fails partway, the `CREATE SCHEMA` rolls back too — no
   * partial tenant schema survives a failed provisioning attempt.
   */
  async createSchema(schemaName: string): Promise<void> {
    assertSchemaName(schemaName);

    const client = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      // Plain `SET`, not `SET LOCAL` — must still be in effect for the
      // multi-statement DDL query issued next on this same connection.
      await client.query(`SET search_path TO "${schemaName}", public`);
      await client.query(this.tenantSchemaSql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      await client.end();
    }
  }

  /** Drops `schemaName` and everything in it. Never throws if it doesn't exist. */
  async deleteSchema(schemaName: string): Promise<void> {
    assertSchemaName(schemaName);

    const client = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await client.end();
    }
  }

  async schemaExists(schemaName: string): Promise<boolean> {
    assertSchemaName(schemaName);

    const client = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
    await client.connect();
    try {
      const { rows } = await client.query(
        'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1',
        [schemaName],
      );
      return rows.length > 0;
    } finally {
      await client.end();
    }
  }
}
