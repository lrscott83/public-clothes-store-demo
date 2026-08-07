import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { schemaNameFor } from './schema-name.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import {
  REQUIRED_TENANT_ENUM_LABELS,
  SCHEMA_CURRENCY_ENV,
  TenantSchemaBehindError,
  TenantSchemaCurrencyService,
  UnknownSchemaCurrencyModeError,
  describeEnumLabelGaps,
  findEnumLabelGaps,
  reportTenantSchemaCurrency,
  resolveSchemaCurrencyMode,
  surveyTenantSchemaCurrency,
  type TenantEnumLabelRow,
} from './tenant-schema-currency.js';

/**
 * CLASS F1 — nothing gated on tenant schema currency, so a deploy that landed
 * before the manual fleet migration broke an unrelated Sales endpoint at
 * runtime.
 *
 * TWO designs were rejected before this one. The first shelled out to
 * `npx prisma migrate diff` once per tenant before `app.listen`. The second
 * replaced that with the single catalog query below but kept `enforce` as the
 * default and `process.exit(1)` as the consequence, over every
 * `store_mgmt_tenant_%` schema in the database — so a gap in ONE tenant
 * refused boot for ALL of them.
 *
 * What is asserted here now: boot NEVER fails, the gate is per schema, `warn`
 * is the default, an unrecognised mode is refused loudly, an empty result set
 * is `unknown` and not `current`, and every fleet-touching assertion is
 * SCOPED to the schemas this spec created.
 */
describe('tenant schema currency probe', () => {
  describe('resolveSchemaCurrencyMode', () => {
    /**
     * `enforce` used to be the default, on the argument that an assertion
     * nobody enables asserts nothing. Sound for a check whose failure costs
     * what the detected failure costs — and this one's cost was the whole API
     * refusing to boot in answer to one endpoint failing in one tenant. Now
     * that `enforce` can cost at most the stale tenant's own requests, the
     * default can be the conservative one.
     */
    it('defaults to warn when unset', () => {
      expect(resolveSchemaCurrencyMode(undefined)).toBe('warn');
      expect(resolveSchemaCurrencyMode('')).toBe('warn');
    });

    it('honours the documented escape hatches', () => {
      expect(resolveSchemaCurrencyMode('warn')).toBe('warn');
      expect(resolveSchemaCurrencyMode('WARN')).toBe('warn');
      expect(resolveSchemaCurrencyMode('enforce')).toBe('enforce');
      expect(resolveSchemaCurrencyMode('off')).toBe('off');
      expect(resolveSchemaCurrencyMode('false')).toBe('off');
      expect(resolveSchemaCurrencyMode('0')).toBe('off');
    });

    /**
     * Every unrecognised value used to resolve to `enforce` — so `warning`
     * and `disabled`, the two most natural typos for the two escape hatches,
     * selected the STRICTEST mode instead of the one being reached for. An
     * escape hatch that does the opposite on a typo is not an escape hatch.
     */
    it('REFUSES an unrecognised value instead of silently choosing the strictest mode', () => {
      expect(() => resolveSchemaCurrencyMode('warning')).toThrow(UnknownSchemaCurrencyModeError);
      expect(() => resolveSchemaCurrencyMode('disabled')).toThrow(UnknownSchemaCurrencyModeError);
      expect(() => resolveSchemaCurrencyMode('nonsense')).toThrow(/enforce, warn, off/);
    });
  });

  describe('REQUIRED_TENANT_ENUM_LABELS', () => {
    /**
     * Read from the GENERATED client, not hand-maintained: a hand-written
     * list of "labels this build needs" is itself a thing that drifts, and it
     * would drift in exactly the direction that makes the probe silent.
     */
    it('is derived from the datamodel and includes the label this whole gate exists for', () => {
      expect(REQUIRED_TENANT_ENUM_LABELS.get('DeliveryAssignmentStatus')).toEqual(
        expect.arrayContaining(['in_transit', 'delivered', 'cancelled']),
      );
      expect(REQUIRED_TENANT_ENUM_LABELS.get('OrderStatus')).toEqual(
        expect.arrayContaining(['created', 'verified', 'delivered', 'cancelled']),
      );
    });
  });

  describe('findEnumLabelGaps', () => {
    const required = new Map<string, readonly string[]>([
      ['DeliveryAssignmentStatus', ['in_transit', 'delivered', 'cancelled']],
    ]);
    const row = (schemaName: string, label: string): TenantEnumLabelRow => ({
      schemaName,
      typeName: 'DeliveryAssignmentStatus',
      label,
    });

    it('reports nothing when every schema carries every label', () => {
      const gaps = findEnumLabelGaps(
        ['store_mgmt_tenant_a'],
        [
          row('store_mgmt_tenant_a', 'in_transit'),
          row('store_mgmt_tenant_a', 'delivered'),
          row('store_mgmt_tenant_a', 'cancelled'),
        ],
        required,
      );

      expect(gaps).toEqual([]);
    });

    it('names the schema, the type and the missing label', () => {
      const gaps = findEnumLabelGaps(
        ['store_mgmt_tenant_a'],
        [row('store_mgmt_tenant_a', 'in_transit'), row('store_mgmt_tenant_a', 'delivered')],
        required,
      );

      expect(gaps).toEqual([
        {
          schemaName: 'store_mgmt_tenant_a',
          typeName: 'DeliveryAssignmentStatus',
          missingLabels: ['cancelled'],
        },
      ]);
    });

    /** A schema carrying the type not at all is the same fact, more so. */
    it('treats a schema with no rows for the type as missing every label', () => {
      const gaps = findEnumLabelGaps(['store_mgmt_tenant_b'], [], required);

      expect(gaps[0]!.missingLabels).toEqual(['in_transit', 'delivered', 'cancelled']);
    });

    /** Extra labels are NOT drift: an older build reading a newer schema is fine. */
    it('ignores labels the schema has and this build does not need', () => {
      expect(
        findEnumLabelGaps(
          ['store_mgmt_tenant_a'],
          [
            row('store_mgmt_tenant_a', 'in_transit'),
            row('store_mgmt_tenant_a', 'delivered'),
            row('store_mgmt_tenant_a', 'cancelled'),
            row('store_mgmt_tenant_a', 'from_the_future'),
          ],
          required,
        ),
      ).toEqual([]);
    });
  });

  describe('describeEnumLabelGaps', () => {
    it('returns null when there are no gaps', () => {
      expect(describeEnumLabelGaps([])).toBeNull();
    });

    it('names every gap and points at the migration command', () => {
      const drift = describeEnumLabelGaps([
        {
          schemaName: 'store_mgmt_tenant_b',
          typeName: 'DeliveryAssignmentStatus',
          missingLabels: ['cancelled'],
        },
      ]);

      expect(drift).toContain('store_mgmt_tenant_b');
      expect(drift).toContain('DeliveryAssignmentStatus');
      expect(drift).toContain('cancelled');
      expect(drift).toContain('scripts/tenant-migrate.ts');
      expect(drift).toContain(SCHEMA_CURRENCY_ENV);
    });
  });

  /**
   * EVERY assertion in here is SCOPED with `tenantSchemas` to the schemas
   * this spec created.
   *
   * Unscoped, these ran against the shared `store_mgmt_test` database while
   * `cancel-assignment-on-order-cancel.spec.ts` deliberately creates a tenant
   * schema carrying the PRE-MIGRATION two-value enum and
   * `tenant-orphan-sweep.spec.ts` deliberately creates extra ones.
   * `maxWorkers: 1` keeps them from overlapping, but any crash, `--bail` or
   * interrupted run leaves a schema behind and makes this file fail
   * PERMANENTLY until somebody drops it by hand — and the drift assertions
   * could pass for a schema they never created.
   */
  describe('surveyTenantSchemaCurrency / reportTenantSchemaCurrency', () => {
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
        await tenantDb.deleteSchema(createdSchemas.pop()!);
      }
    });

    afterAll(async () => {
      await rawClient.end();
    });

    async function createInSyncTenant(): Promise<string> {
      const schemaName = schemaNameFor(randomUUID());
      await tenantDb.createSchema(schemaName);
      createdSchemas.push(schemaName);
      return schemaName;
    }

    async function makeBehind(schemaName: string): Promise<void> {
      await rawClient.query(
        `ALTER TYPE "${schemaName}"."DeliveryAssignmentStatus" RENAME VALUE 'cancelled' TO 'canceled'`,
      );
    }

    it('returns without throwing when mode is off, and never touches the database', async () => {
      const logs: string[] = [];

      const survey = await reportTenantSchemaCurrency({
        connectionString: 'postgresql://nobody@127.0.0.1:1/none',
        mode: 'off',
        logger: { log: (m: string) => logs.push(m), warn: () => undefined },
      });

      expect(survey.status).toBe('unknown');
      expect(logs.join('\n')).toContain('off');
    });

    it('reports `current` for a schema provisioned from the current datamodel', async () => {
      const schemaName = await createInSyncTenant();

      const survey = await surveyTenantSchemaCurrency({
        connectionString,
        tenantSchemas: [schemaName],
      });

      expect(survey.status).toBe('current');
      expect(survey.schemaNames).toEqual([schemaName]);
    });

    it('reports `behind` — naming the schema — when a label this build writes is missing', async () => {
      const schemaName = await createInSyncTenant();
      await makeBehind(schemaName);

      const survey = await surveyTenantSchemaCurrency({
        connectionString,
        tenantSchemas: [schemaName],
      });

      expect(survey.status).toBe('behind');
      expect(survey.message).toContain(schemaName);
    });

    /**
     * THE owner decision of this round: the boot path lost its power to take
     * the API down. `enforce` no longer means "refuse to boot", it means
     * "refuse the affected tenant's own requests" — and that decision is made
     * one layer up, in `TenantContextGuard`.
     */
    it('NEVER refuses boot on an established gap, even at enforce', async () => {
      const schemaName = await createInSyncTenant();
      await makeBehind(schemaName);
      const warnings: string[] = [];

      const survey = await reportTenantSchemaCurrency({
        connectionString,
        mode: 'enforce',
        tenantSchemas: [schemaName],
        logger: { log: () => undefined, warn: (m: string) => warnings.push(m) },
      });

      expect(survey.status).toBe('behind');
      expect(warnings.join('\n')).toContain(schemaName);
      expect(warnings.join('\n')).toMatch(/request time/i);
    });

    /**
     * An unreachable database is not evidence of drift, it is evidence of
     * nothing.
     */
    it('reports `unknown`, not `behind`, on a transient failure', async () => {
      const warnings: string[] = [];

      const survey = await reportTenantSchemaCurrency({
        connectionString: 'postgresql://nobody@127.0.0.1:1/none',
        mode: 'enforce',
        timeoutMs: 1_000,
        logger: { log: () => undefined, warn: (m: string) => warnings.push(m) },
      });

      expect(survey.status).toBe('unknown');
      expect(warnings.join('\n')).toMatch(/could not run/i);
    }, 20_000);

    /**
     * An empty result set used to log "0 tenant schema(s) current" and read as
     * SUCCESS, so a `DATABASE_URL` pointing at the wrong database turned the
     * whole gate into a silent no-op that reported everything was fine. That
     * is the same "could not establish" / "established to be fine"
     * conflation this module explicitly rejects for probe failures.
     */
    it('treats a probe that matched NO schemas as `unknown`, never as `current`', async () => {
      const warnings: string[] = [];

      const survey = await reportTenantSchemaCurrency({
        connectionString,
        mode: 'enforce',
        tenantSchemas: [schemaNameFor(randomUUID())],
        logger: { log: () => undefined, warn: (m: string) => warnings.push(m) },
      });

      expect(survey.status).toBe('unknown');
      expect(warnings.join('\n')).toMatch(/could not be established/i);
      expect(warnings.join('\n')).not.toMatch(/current/i);
    });

    it('refuses a tenantSchemas entry that is not a valid tenant schema name', async () => {
      const survey = await surveyTenantSchemaCurrency({
        connectionString,
        tenantSchemas: ['public"; DROP TABLE carrier; --'],
      });

      expect(survey.status).toBe('unknown');
      expect(survey.message).toMatch(/could not run/i);
    });
  });

  /**
   * THE GATE. Per schema, per request, cached — the replacement for a
   * fleet-wide `process.exit(1)`.
   */
  describe('TenantSchemaCurrencyService', () => {
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
        await tenantDb.deleteSchema(createdSchemas.pop()!);
      }
    });

    afterAll(async () => {
      await rawClient.end();
    });

    async function createInSyncTenant(): Promise<string> {
      const schemaName = schemaNameFor(randomUUID());
      await tenantDb.createSchema(schemaName);
      createdSchemas.push(schemaName);
      return schemaName;
    }

    it('lets a current tenant through', async () => {
      const schemaName = await createInSyncTenant();
      const service = new TenantSchemaCurrencyService({ connectionString, mode: 'enforce' });

      await expect(service.assertSchemaCurrent(schemaName)).resolves.toBeUndefined();
    });

    /**
     * THE property the boot gate could not have: the stale tenant is refused
     * and the healthy one served, in the same process, at the same moment.
     */
    it('refuses ONLY the stale tenant at enforce — the healthy one keeps serving', async () => {
      const stale = await createInSyncTenant();
      const healthy = await createInSyncTenant();
      await rawClient.query(
        `ALTER TYPE "${stale}"."DeliveryAssignmentStatus" RENAME VALUE 'cancelled' TO 'canceled'`,
      );
      const service = new TenantSchemaCurrencyService({ connectionString, mode: 'enforce' });

      await expect(service.assertSchemaCurrent(stale)).rejects.toThrow(TenantSchemaBehindError);
      await expect(service.assertSchemaCurrent(healthy)).resolves.toBeUndefined();
    });

    it('logs once and serves at warn — the default', async () => {
      const stale = await createInSyncTenant();
      await rawClient.query(
        `ALTER TYPE "${stale}"."DeliveryAssignmentStatus" RENAME VALUE 'cancelled' TO 'canceled'`,
      );
      const warnings: string[] = [];
      const service = new TenantSchemaCurrencyService({
        connectionString,
        mode: 'warn',
        logger: { log: () => undefined, warn: (m: string) => warnings.push(m) },
      });

      await expect(service.assertSchemaCurrent(stale)).resolves.toBeUndefined();
      await expect(service.assertSchemaCurrent(stale)).resolves.toBeUndefined();

      // Once per schema, not once per request: a stale tenant under load
      // would otherwise bury every other line in the log.
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(stale);
    });

    /**
     * A `current` verdict is cached for the process's lifetime, so this is
     * not a per-request round trip. Proven by DELETING the schema after the
     * first call: an uncached second call would probe a schema that no longer
     * exists and come back `unknown`, which cannot throw either — so the
     * assertion is on the probe NOT having run, observed through the fact
     * that the verdict survives the schema.
     */
    it('caches a current verdict instead of probing on every request', async () => {
      const schemaName = await createInSyncTenant();
      const service = new TenantSchemaCurrencyService({ connectionString, mode: 'enforce' });
      await service.assertSchemaCurrent(schemaName);

      await tenantDb.deleteSchema(createdSchemas.pop()!);

      const survey = await surveyTenantSchemaCurrency({
        connectionString,
        tenantSchemas: [schemaName],
      });
      // The schema really is gone — an uncached probe now answers `unknown`.
      expect(survey.status).toBe('unknown');
      // The service still answers from its cache.
      await expect(service.assertSchemaCurrent(schemaName)).resolves.toBeUndefined();
    });

    it('never refuses on an unreachable database, at any mode', async () => {
      const service = new TenantSchemaCurrencyService({
        connectionString: 'postgresql://nobody@127.0.0.1:1/none',
        mode: 'enforce',
        timeoutMs: 1_000,
      });

      await expect(
        service.assertSchemaCurrent(schemaNameFor(randomUUID())),
      ).resolves.toBeUndefined();
    }, 20_000);

    it('does nothing at all when mode is off', async () => {
      const service = new TenantSchemaCurrencyService({
        connectionString: 'postgresql://nobody@127.0.0.1:1/none',
        mode: 'off',
      });

      await expect(
        service.assertSchemaCurrent(schemaNameFor(randomUUID())),
      ).resolves.toBeUndefined();
    });
  });
});
