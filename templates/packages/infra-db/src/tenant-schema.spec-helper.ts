import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { schemaNameFor } from './tenant/schema-name.js';
import { TenantDatabaseService } from './tenant/tenant-database.service.js';
import { TenantPrismaFactory } from './tenant/tenant-prisma-factory.js';
import type { TenantContextService } from './tenant/tenant-context.service.js';
import type { PrismaClient } from '../generated/tenant/client.js';

/**
 * Schema-per-suite tenant test infra (design.md §4, P12 Option C).
 *
 * Tenant-side `infra-db` repository specs (~12 files, Phase 6) and the
 * cross-schema isolation proof (Phase 13) need a REAL, isolated tenant
 * schema to run against — not a mock, and not the shared `public` schema
 * master-side specs already use. This helper provisions one schema per
 * suite via `beforeAll` and drops it via `afterAll`, reusing Phase 4's
 * `TenantDatabaseService`/`TenantPrismaFactory` rather than re-implementing
 * `CREATE SCHEMA` + DDL-apply here a second time — those classes are also
 * what production provisioning (D7's saga) calls, so this test path
 * exercises the same code, not a parallel one.
 *
 * Each suite gets its OWN schema, derived from a fresh UUID via
 * `schemaNameFor` — two suites running in the same file (or, once
 * `maxWorkers` ever changes, concurrently) can never collide on a name.
 * `afterAll` drops the schema unconditionally, including when the suite's
 * `beforeAll`/tests failed, so a broken suite never leaks a schema into the
 * shared dev/test database — Phase 13 will provision two tenants in one
 * process, and a leftover schema from an earlier failed run is exactly the
 * kind of cross-run contamination `jest.global-setup.js`'s sweep (task
 * 12.5) exists to catch between runs, mirrored here per-suite.
 * `db-cleanup.spec-helper.ts` (the pre-split RESTRICT-ordering cleanup
 * helper it used to be compared against) was deleted in task 5.2 — with the
 * schema split complete, master's own relations `onDelete: Cascade` and
 * tenant-side rows are wiped by dropping the whole schema, so there was
 * nothing left for it to centralize on either side.
 *
 * Usage — call once at the top of a `describe` block:
 *
 * ```ts
 * describe('PrismaXRepository', () => {
 *   const getTenantSchema = useTenantSchema();
 *
 *   it('...', async () => {
 *     const { client, schemaName } = getTenantSchema();
 *     const repo = new PrismaXRepository(client);
 *     // ...
 *   });
 * });
 * ```
 */

export interface TenantSchemaHandle {
  /** The provisioned schema's name (`schemaNameFor(<fresh uuid>)`). */
  readonly schemaName: string;
  /** A Prisma client bound to this schema alone — see D2's search_path note. */
  readonly client: PrismaClient;
}

/**
 * Registers `beforeAll`/`afterAll` hooks that provision (and later drop) one
 * fresh tenant schema for the enclosing `describe` block, and returns a
 * getter for the resulting handle. MUST be called at `describe`-body scope
 * (module-evaluation time), the same way Jest's own `beforeAll`/`afterAll`
 * must be — calling the getter before `beforeAll` has run (e.g. outside an
 * `it`) throws.
 */
export function useTenantSchema(): () => TenantSchemaHandle {
  const dbService = new TenantDatabaseService();
  const factory = new TenantPrismaFactory();
  let handle: TenantSchemaHandle | undefined;

  beforeAll(async () => {
    const schemaName = schemaNameFor(randomUUID());
    // Reuses Phase 4's provisioning primitive verbatim: CREATE SCHEMA +
    // apply `prisma/tenant-schema.sql`, atomically, search_path set first.
    await dbService.createSchema(schemaName);
    handle = { schemaName, client: factory.getClient(schemaName) };
  });

  afterAll(async () => {
    // Unconditional: runs whether every test in this suite passed or not.
    // Only skips the drop if `beforeAll` itself never got far enough to
    // create anything — `createSchema` is one transaction, so a failure
    // there leaves no schema behind to drop in the first place.
    if (handle) {
      const { schemaName } = handle;
      handle = undefined;
      await factory.disposeClient(schemaName);
      await dbService.deleteSchema(schemaName);
    }
  });

  return () => {
    if (!handle) {
      throw new Error(
        'useTenantSchema(): no active schema — call the returned getter only inside a test, after beforeAll has run',
      );
    }
    return handle;
  };
}

/**
 * Phase 6's ~12 tenant-side repositories depend on `TenantContextService`
 * (design.md D2/D5), not a directly-injected Prisma client — production code
 * MUST resolve its client through the AsyncLocalStorage-scoped
 * `getClient()`, never hold one at construction time. Repository specs don't
 * need real ALS/guard-chain scoping (that's Phase 7's `TenantContextGuard` +
 * `runInTenant` re-scoping) — they need `getClient()` to resolve to
 * `useTenantSchema()`'s already-provisioned, already-disposed-in-`afterAll`
 * client, so this fakes ONLY the one method repositories call, structurally
 * cast to `TenantContextService` (same convention as
 * `tenant-context.service.spec.ts`'s faked `TenantPrismaFactory`). Building a
 * SECOND `TenantPrismaFactory`/pool bound to the same schema name would open
 * a real second connection pool that nothing here ever disposes — this
 * avoids that entirely by returning the exact client `useTenantSchema()`
 * already owns and cleans up.
 */
export function fakeTenantContext(getTenantSchema: () => TenantSchemaHandle): TenantContextService {
  return {
    getClient: () => getTenantSchema().client,
  } as unknown as TenantContextService;
}

/**
 * Proves a repository spec is genuinely exercising the provisioned tenant
 * schema, not silently resolving into `public` (the trap called out by this
 * batch's instructions: `747a2b6` removed the `,public` search_path
 * fallback, but a spec that never provisions a tenant schema — or reaches a
 * master/default client — can still pass for the wrong reason). `public`
 * still holds the pre-split legacy tables (same names/columns) until task
 * 14.2's `migrate reset`, so a row written through a genuinely tenant-scoped
 * client must NEVER be readable from `public` under the same identifying
 * column value. Every repo spec touched in Phase 6 calls this at least once
 * after a write.
 */
export async function assertAbsentFromPublicSchema(
  table: string,
  column: string,
  value: string,
): Promise<void> {
  const client = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
  await client.connect();
  try {
    let rows: Array<Record<string, unknown>>;
    try {
      ({ rows } = await client.query(
        `SELECT 1 FROM public."${table}" WHERE "${column}" = $1`,
        [value],
      ));
    } catch (err) {
      // A FRESH database (new contributor machine, new CI database) has no
      // legacy tables in `public` at all — Postgres raises 42P01. That is
      // isolation in its strongest form: nothing to leak into. Only a table
      // that EXISTS with the row readable counts as a failure.
      if ((err as { code?: string }).code === '42P01') return;
      throw err;
    }
    if (rows.length > 0) {
      throw new Error(
        `Row ${value} unexpectedly readable from public."${table}"."${column}" — tenant isolation broken`,
      );
    }
  } finally {
    await client.end();
  }
}
