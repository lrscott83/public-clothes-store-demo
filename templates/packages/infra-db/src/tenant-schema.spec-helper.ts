import { randomUUID } from 'node:crypto';
import { schemaNameFor } from './tenant/schema-name.js';
import { TenantDatabaseService } from './tenant/tenant-database.service.js';
import { TenantPrismaFactory } from './tenant/tenant-prisma-factory.js';
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
 * kind of cross-run contamination `db-cleanup.spec-helper.ts` already fights
 * for `public`.
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
