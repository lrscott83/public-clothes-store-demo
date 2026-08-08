import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { schemaNameFor } from './schema-name.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import {
  MINIMUM_SERVER_VERSION_NUM,
  describeUnsupportedServerVersion,
  migrateTenantFleet,
  resolveTenantMigratePaths,
  withTenantSchema,
  type TenantMigrationOptions,
} from './tenant-migrate.js';

// `toSchemaPath`/`configPath`/`cwd` are required, not defaulted inside the
// library — see `resolveTenantMigratePaths`'s doc comment (this file runs
// under ts-jest/CommonJS, so `__dirname` is safe to use here).
const MIGRATE_PATHS = resolveTenantMigratePaths(__dirname);

function migrate(
  overrides: Partial<Omit<TenantMigrationOptions, 'connectionString'>> & { connectionString: string },
) {
  return migrateTenantFleet({
    toSchemaPath: MIGRATE_PATHS.toSchemaPath,
    configPath: MIGRATE_PATHS.configPath,
    cwd: MIGRATE_PATHS.packageRoot,
    ...overrides,
  });
}

/**
 * Integration test against the real `store_mgmt_test` database (no mocks —
 * same discipline as every other `infra-db` spec, and task 11.2's own
 * instruction: "a mocked migration tool proves nothing"). Every fixture
 * below is a REAL tenant schema, created via `TenantDatabaseService` (the
 * same primitive design D7's provisioning saga uses) and dropped in
 * `afterEach`, even on failure.
 */
describe('migrateTenantFleet', () => {
  const connectionString = process.env.DATABASE_URL ?? '';
  let tenantDb: TenantDatabaseService;
  let rawClient: PgClient;
  const createdSchemas: string[] = [];

  beforeAll(async () => {
    tenantDb = new TenantDatabaseService();
    rawClient = new PgClient({ connectionString });
    await rawClient.connect();
  });

  afterEach(async () => {
    while (createdSchemas.length > 0) {
      const schemaName = createdSchemas.pop()!;
       
      await tenantDb.deleteSchema(schemaName);
    }
  });

  afterAll(async () => {
    await rawClient.end();
  });

  /** A fresh tenant schema provisioned from the CURRENT `prisma/tenant-schema.sql` — starts fully in sync. */
  async function createInSyncTenant(): Promise<string> {
    const schemaName = schemaNameFor(randomUUID());
    await tenantDb.createSchema(schemaName);
    createdSchemas.push(schemaName);
    return schemaName;
  }

  /** Simulates a tenant provisioned under an OLDER shape of the schema — a genuine, non-destructive drift. */
  async function dropColumn(schemaName: string, table: string, column: string): Promise<void> {
    await rawClient.query(`SET search_path TO "${schemaName}"`);
    try {
      await rawClient.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
    } finally {
      await rawClient.query('SET search_path TO public');
    }
  }

  /** Simulates a tenant whose live schema carries a column the current model no longer has — destructive drift. */
  async function addColumn(schemaName: string, table: string, column: string): Promise<void> {
    await rawClient.query(`SET search_path TO "${schemaName}"`);
    try {
      await rawClient.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" text`);
    } finally {
      await rawClient.query('SET search_path TO public');
    }
  }

  async function columnExists(schemaName: string, table: string, column: string): Promise<boolean> {
    const { rows } = await rawClient.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3',
      [schemaName, table, column],
    );
    return rows.length > 0;
  }

  describe('happy path — fleet already in sync', () => {
    it('reports every tenant in-sync and does not fail the run', async () => {
      const a = await createInSyncTenant();
      const b = await createInSyncTenant();

      const report = await migrate({ connectionString, tenantSchemas: [a, b] });

      expect(report.mode).toBe('migrate');
      expect(report.failed).toBe(false);
      expect(report.results.map((r) => r.status)).toEqual(['in-sync', 'in-sync']);
    }, 30_000);
  });

  describe('non-destructive drift', () => {
    it('applies a missing column and reports the tenant migrated', async () => {
      const schemaName = await createInSyncTenant();
      await dropColumn(schemaName, 'exchange_rate', 'created_at');
      expect(await columnExists(schemaName, 'exchange_rate', 'created_at')).toBe(false);

      const report = await migrate({ connectionString, tenantSchemas: [schemaName] });

      expect(report.failed).toBe(false);
      expect(report.results[0]?.status).toBe('migrated');
      expect(await columnExists(schemaName, 'exchange_rate', 'created_at')).toBe(true);
    }, 30_000);
  });

  describe('destructive drift — the tool refuses on its own, Prisma has no gate of its own', () => {
    it('refuses a DROP COLUMN without --allow-destructive and leaves the column standing', async () => {
      const schemaName = await createInSyncTenant();
      await addColumn(schemaName, 'exchange_rate', 'spike_extra_col');

      const report = await migrate({ connectionString, tenantSchemas: [schemaName] });

      expect(report.failed).toBe(true);
      expect(report.results[0]?.status).toBe('refused-destructive');
      expect(report.results[0]?.diff).toMatch(/DROP COLUMN/i);
      expect(await columnExists(schemaName, 'exchange_rate', 'spike_extra_col')).toBe(true);
    }, 30_000);

    it('applies the DROP COLUMN when --allow-destructive is passed explicitly', async () => {
      const schemaName = await createInSyncTenant();
      await addColumn(schemaName, 'exchange_rate', 'spike_extra_col');

      const report = await migrate({
        connectionString,
        tenantSchemas: [schemaName],
        allowDestructive: true,
      });

      expect(report.failed).toBe(false);
      expect(report.results[0]?.status).toBe('migrated');
      expect(await columnExists(schemaName, 'exchange_rate', 'spike_extra_col')).toBe(false);
    }, 30_000);
  });

  describe('drift check (--check) — never applies', () => {
    it('names the behind tenant and fails the run, without touching the schema', async () => {
      const schemaName = await createInSyncTenant();
      await addColumn(schemaName, 'exchange_rate', 'spike_extra_col');

      const report = await migrate({ connectionString, mode: 'check', tenantSchemas: [schemaName] });

      expect(report.mode).toBe('check');
      expect(report.failed).toBe(true);
      expect(report.results[0]?.status).toBe('behind');
      expect(report.results[0]?.diff).toMatch(/exchange_rate/);
      // Check mode never applies — the column a real migrate run would drop is still there.
      expect(await columnExists(schemaName, 'exchange_rate', 'spike_extra_col')).toBe(true);
    }, 30_000);

    it('reports an in-sync tenant cleanly and does not fail the run', async () => {
      const schemaName = await createInSyncTenant();

      const report = await migrate({ connectionString, mode: 'check', tenantSchemas: [schemaName] });

      expect(report.failed).toBe(false);
      expect(report.results[0]?.status).toBe('in-sync');
    }, 30_000);
  });

  describe('one tenant timing out does not block the others', () => {
    it('reports the timed-out tenant, still migrates the rest, and fails the run', async () => {
      const slow = await createInSyncTenant();
      const fast1 = await createInSyncTenant();
      const fast2 = await createInSyncTenant();
      // Real drift on the "slow" tenant too — so a false positive (it just
      // happened to already be in-sync) can never masquerade as a correctly
      // detected timeout.
      await addColumn(slow, 'exchange_rate', 'spike_extra_col');

      const report = await migrate({
        connectionString,
        tenantSchemas: [slow, fast1, fast2],
        allowDestructive: true,
        // 20ms is far below what `npx prisma migrate diff` can ever
        // complete in (verified empirically before writing this test —
        // process startup alone takes hundreds of ms). This forces a REAL
        // timeout of a REAL subprocess for exactly one tenant, no mocks.
        timeoutOverridesMs: { [slow]: 20 },
      });

      expect(report.failed).toBe(true);
      const statusBySchema = new Map(report.results.map((r) => [r.schemaName, r.status]));
      expect(statusBySchema.get(slow)).toBe('timed-out');
      expect(statusBySchema.get(fast1)).toBe('in-sync');
      expect(statusBySchema.get(fast2)).toBe('in-sync');
    }, 60_000);

    /**
     * The same hole `close-stranded-assignments.ts` had, in the same shape:
     * `assertSchemaName` sat OUTSIDE `migrateOneTenant`'s try, so an
     * unusable schema name threw straight out of the fleet loop and
     * discarded every result already collected — while the surrounding
     * design ("one hung/slow tenant never prevents the rest of the fleet
     * from being attempted") says the exact opposite.
     */
    it('reports an unusable schema name as an errored tenant, and still migrates the rest', async () => {
      const healthy = await createInSyncTenant();

      const report = await migrate({
        connectionString,
        tenantSchemas: ['not-a-valid-schema-name"; DROP TABLE carrier; --', healthy],
        mode: 'check',
      });

      expect(report.failed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]!.status).toBe('error');
      expect(report.results[0]!.error).toContain('Invalid tenant schema name');
      expect(report.results[1]!.status).toBe('in-sync');
    }, 60_000);
  });

  describe('withTenantSchema', () => {
    it('overwrites an existing ?schema= param rather than appending a duplicate', () => {
      const url = withTenantSchema('postgresql://u:p@host:5432/db?schema=public', 'store_mgmt_tenant_x');

      expect(url).toContain('schema=store_mgmt_tenant_x');
      expect(url).not.toContain('schema=public');
    });

    it('adds ?schema= when the base connection string has none', () => {
      const url = withTenantSchema('postgresql://u:p@host:5432/db', 'store_mgmt_tenant_x');

      expect(url).toContain('schema=store_mgmt_tenant_x');
    });
  });

  /**
   * CLASS F2 — `applyDiff` wraps the generated script in an explicit
   * `BEGIN`/`COMMIT`, and `ALTER TYPE ... ADD VALUE` (which is exactly what
   * shipping a new enum value emits) is ILLEGAL inside a transaction block on
   * PostgreSQL < 12. On such a server the tenant would simply come back
   * `error` with a raw driver message, which reads like a migration bug
   * rather than "your database is too old". Asserted up front instead.
   */
  describe('minimum PostgreSQL version', () => {
    it('names 12 as the floor', () => {
      expect(MINIMUM_SERVER_VERSION_NUM).toBe(120_000);
    });

    it('rejects PG 11 with a message that names the real cause', () => {
      const message = describeUnsupportedServerVersion(110_012);

      expect(message).toMatch(/11\.12/);
      expect(message).toMatch(/12/);
      expect(message).toMatch(/ALTER TYPE/i);
    });

    it('accepts PG 12 and anything newer', () => {
      expect(describeUnsupportedServerVersion(120_000)).toBeNull();
      expect(describeUnsupportedServerVersion(160_013)).toBeNull();
    });

    it('the real test database satisfies the floor, so every other spec here is meaningful', async () => {
      const { rows } = await rawClient.query<{ server_version_num: string }>(
        'SHOW server_version_num',
      );
      expect(describeUnsupportedServerVersion(Number(rows[0]!.server_version_num))).toBeNull();
    });

    it('marks every tenant errored — and fails the run — when the server is too old', async () => {
      const schemaName = await createInSyncTenant();

      const report = await migrate({
        connectionString,
        tenantSchemas: [schemaName],
        minimumServerVersionNum: 999_999,
      });

      expect(report.failed).toBe(true);
      expect(report.results).toHaveLength(1);
      expect(report.results[0]!.status).toBe('error');
      expect(report.results[0]!.error).toMatch(/ALTER TYPE/i);
    });
  });
});
