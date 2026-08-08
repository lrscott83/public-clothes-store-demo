import { Injectable, Optional } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { $Enums } from '../../generated/tenant/client.js';
import { assertSchemaName } from './schema-name.js';

/**
 * Tenant schema-currency PROBE, and the per-tenant gate built on it
 * (design D6; CLASS F1).
 *
 * Tenant schemas evolve ONLY through a manual, out-of-band
 * `node scripts/tenant-migrate.ts`, and nothing used to gate anything on that
 * having been run. So a deploy that shipped code depending on new DDL before
 * the fleet migration produced runtime 500s on endpoints that had nothing to
 * do with the new feature — the `DeliveryAssignmentStatus` `cancelled` value
 * turned `POST /orders/:id/cancel` into a 500 for EVERY order in an
 * un-migrated tenant.
 *
 * WHAT THIS IS NOT, AND WHY — TWO REJECTED DESIGNS.
 *
 * 1. The first attempt ran `scripts/tenant-migrate.ts --check` at startup,
 *    which means spawning `npx prisma migrate diff` ONCE PER TENANT,
 *    sequentially, before `app.listen`. `prisma` is a devDependency, so a
 *    pruned production image could only ever fail; boot latency became
 *    `tenants x subprocess spawn`; and a subprocess error counted as DRIFT.
 *
 * 2. The second attempt replaced that with the ONE catalog query below — but
 *    kept `enforce` as the DEFAULT and kept the CONSEQUENCE at
 *    `process.exit(1)`. That is the defect this file now exists to state
 *    plainly: the probe covers every `store_mgmt_tenant_%` schema in the
 *    database, so a gap in ONE tenant refused boot for ALL of them. The
 *    failure it replaced was one endpoint 500ing in one tenant.
 *
 *    That is not a hypothetical. `api-idp` is a SEPARATE deployable that
 *    provisions tenant schemas at runtime from its OWN image's bundled
 *    `prisma/tenant-schema.sql` (`create-company.saga.ts` ->
 *    `TenantDatabaseService.createSchema`). In any rolling deploy where
 *    api-idp lags api-salesops, one company signup creates a schema without
 *    the new label, and the next api-salesops restart or scale-up refuses to
 *    boot company-wide. A `refused-destructive` tenant from `tenant-migrate`,
 *    a restored-from-backup schema, and an orphan schema (`tenant-orphan-
 *    sweep.ts` exists because those happen) all do the same.
 *
 * WHAT THIS IS NOW. The detection is unchanged — one read-only query, one
 * connection, using only `pg` (a real dependency), asserting the NARROW
 * property that every enum LABEL this build can write exists in the schemas
 * it looked at. What changed is the CONSEQUENCE:
 *
 *   - BOOT never fails. `reportTenantSchemaCurrency` logs and returns, in
 *     every mode. It is a report, not a gate; its name says so.
 *   - The GATE is per tenant and per request:
 *     `TenantSchemaCurrencyService.assertSchemaCurrent(schemaName)`, called
 *     from `TenantContextGuard` once the request's schema is known. A stale
 *     tenant fails its OWN requests while every other tenant keeps serving.
 *     That also covers tenants provisioned at RUNTIME, which a boot-only
 *     probe never saw until the next restart.
 *   - `warn` is the DEFAULT. `enforce` — refusing the affected tenant's own
 *     requests with 503 — is opt-in, and even then it can cost at most the
 *     one tenant that is actually behind.
 *
 * Column-level drift is NOT covered here — `node scripts/tenant-migrate.ts
 * --check` in CI or at deploy time remains the full check.
 *
 * A gap can only ever be reported when it was POSITIVELY ESTABLISHED. If the
 * probe itself cannot run — unreachable database, timeout, insufficient
 * privileges — or if it looked at NO schemas at all, the verdict is
 * `unknown`, never `current`. Not knowing whether a schema is current is
 * neither evidence that it is nor that it is not.
 */

export type SchemaCurrencyMode = 'enforce' | 'warn' | 'off';

/** Env var that selects the mode. Absent means `warn`; anything unrecognised is REFUSED. */
export const SCHEMA_CURRENCY_ENV = 'TENANT_SCHEMA_DRIFT_CHECK';

const SCHEMA_PREFIX = 'store_mgmt_tenant_';

/**
 * Wall-clock budget for the single probe query, connection included. Small on
 * purpose: the answer is one index-free scan of `pg_enum`, which is a catalog
 * of tens of rows, and on the request path it sits in front of a user.
 */
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * How long a `behind` verdict is trusted before the schema is probed again.
 *
 * A `current` verdict is cached for the life of the process — a schema does
 * not lose enum labels. A `behind` one MUST expire, or running
 * `scripts/tenant-migrate.ts` would not bring the tenant back without a
 * restart, which is the same "operator has no way out" shape the boot gate
 * had.
 */
const BEHIND_VERDICT_TTL_MS = 30_000;

/** Thrown by `resolveSchemaCurrencyMode` for a value that is not one of the three modes. */
export class UnknownSchemaCurrencyModeError extends Error {
  constructor(public readonly raw: string) {
    super(
      `${SCHEMA_CURRENCY_ENV}="${raw}" is not a valid mode. Use one of: enforce, warn, off ` +
        '(also accepted for off: false, 0).',
    );
    this.name = 'UnknownSchemaCurrencyModeError';
  }
}

/** Thrown by the per-tenant gate at `enforce` — the ONE tenant that is behind, and nobody else. */
export class TenantSchemaBehindError extends Error {
  constructor(
    public readonly schemaName: string,
    message: string,
  ) {
    super(message);
    this.name = 'TenantSchemaBehindError';
  }
}

/**
 * `warn` is the DEFAULT.
 *
 * The previous default was `enforce`, justified as "an assertion that is off
 * unless somebody remembers to turn it on does not assert anything". That
 * argument is sound for a check whose failure costs what the failure it
 * detects costs. It was not sound here: the detected failure is one endpoint
 * 500ing in one tenant, and the consequence was the whole API refusing to
 * boot for every tenant. Now that the consequence is scoped to the affected
 * tenant's own requests, the default can be the conservative one and
 * `enforce` can be a deliberate choice.
 *
 * UNKNOWN VALUES ARE REFUSED, LOUDLY. This function used to map every
 * unrecognised string to `enforce`, so `TENANT_SCHEMA_DRIFT_CHECK=warning` or
 * `=disabled` — the two most natural typos for the two escape hatches — chose
 * the STRICTEST mode instead of the one the operator was reaching for. An
 * escape hatch that silently does the opposite on a typo is not an escape
 * hatch.
 */
export function resolveSchemaCurrencyMode(raw: string | undefined): SchemaCurrencyMode {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === '') return 'warn';
  if (normalized === 'off' || normalized === 'false' || normalized === '0') return 'off';
  if (normalized === 'warn') return 'warn';
  if (normalized === 'enforce') return 'enforce';
  throw new UnknownSchemaCurrencyModeError(raw ?? '');
}

/**
 * Every enum type in the tenant datamodel, mapped to the labels THIS BUILD
 * can write — read straight out of the generated Prisma client rather than
 * hand-listed.
 *
 * A hand-maintained list would be a second copy of the datamodel, and it
 * would drift in the one direction that makes this probe silently useless:
 * somebody adds an enum value, forgets the list, and the gate stops covering
 * the exact case it was built for. `generated/tenant/enums.ts` is regenerated
 * from `prisma/tenant/schema.prisma` on every `prisma generate`, so it cannot
 * disagree with the client the app queries through.
 */
export const REQUIRED_TENANT_ENUM_LABELS: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries($Enums as unknown as Record<string, unknown>)
    .filter((entry): entry is [string, Record<string, unknown>] => {
      const value = entry[1];
      return typeof value === 'object' && value !== null;
    })
    .map(([typeName, labels]): [string, readonly string[]] => [
      typeName,
      Object.values(labels).filter((label): label is string => typeof label === 'string'),
    ])
    .filter(([, labels]) => labels.length > 0),
);

/** One `(schema, enum type, label)` triple as the catalog reports it. */
export interface TenantEnumLabelRow {
  readonly schemaName: string;
  readonly typeName: string;
  readonly label: string;
}

/** One enum type in one tenant schema that is missing labels this build writes. */
export interface EnumLabelGap {
  readonly schemaName: string;
  readonly typeName: string;
  readonly missingLabels: readonly string[];
}

/**
 * Pure over the catalog rows, so both branches are testable without an
 * out-of-date fleet to point at.
 *
 * Only MISSING labels are drift. A schema carrying labels this build does not
 * know about is NOT reported: that is an older app against a newer schema,
 * which is the normal state of a rolling deploy and is not a reason to refuse
 * anything.
 */
export function findEnumLabelGaps(
  schemaNames: readonly string[],
  rows: readonly TenantEnumLabelRow[],
  required: ReadonlyMap<string, readonly string[]> = REQUIRED_TENANT_ENUM_LABELS,
): EnumLabelGap[] {
  const present = new Map<string, Set<string>>();
  for (const row of rows) {
    // ` ` cannot occur in a Postgres identifier, so it is a safe joiner.
    const key = `${row.schemaName} ${row.typeName}`;
    let labels = present.get(key);
    if (!labels) {
      labels = new Set<string>();
      present.set(key, labels);
    }
    labels.add(row.label);
  }

  const gaps: EnumLabelGap[] = [];
  for (const schemaName of schemaNames) {
    for (const [typeName, requiredLabels] of required) {
      const found = present.get(`${schemaName} ${typeName}`);
      const missingLabels = requiredLabels.filter((label) => !found?.has(label));
      if (missingLabels.length > 0) {
        gaps.push({ schemaName, typeName, missingLabels });
      }
    }
  }
  return gaps;
}

/**
 * `null` when the schemas carry every label this build writes; otherwise a
 * human-readable summary naming the command that fixes it.
 */
export function describeEnumLabelGaps(gaps: readonly EnumLabelGap[]): string | null {
  if (gaps.length === 0) {
    return null;
  }
  const lines = gaps.map(
    (gap) => `  - ${gap.schemaName}."${gap.typeName}" is missing: ${gap.missingLabels.join(', ')}`,
  );
  return (
    `${gaps.length} tenant enum type(s) are behind this build:\n${lines.join('\n')}\n` +
    'Run `node scripts/tenant-migrate.ts` (in packages/infra-db) BEFORE deploying this build. ' +
    `Set ${SCHEMA_CURRENCY_ENV}=warn to log instead of refusing the affected tenant, or =off to skip the probe.`
  );
}

/**
 * `current` — every schema looked at carries every label this build writes.
 * `behind` — at least one POSITIVELY ESTABLISHED missing label.
 * `unknown` — the probe could not run, or it looked at no schemas at all.
 *
 * `unknown` is a distinct value on purpose. Folding it into `current` is the
 * exact conflation this module rejects for probe failures, and an empty
 * result set is the same mistake wearing a different hat: a `DATABASE_URL`
 * pointing at the wrong database returns zero `store_mgmt_tenant_%` schemas,
 * which is not "the fleet is current", it is "I was looking somewhere else".
 */
export type SchemaCurrencyStatus = 'current' | 'behind' | 'unknown';

export interface SchemaCurrencySurvey {
  readonly status: SchemaCurrencyStatus;
  readonly schemaNames: readonly string[];
  readonly gaps: readonly EnumLabelGap[];
  /** Always set — the line to log, whatever the status. */
  readonly message: string;
}

export interface SurveyTenantSchemaCurrencyOptions {
  readonly connectionString: string;
  /** Wall-clock budget for the single probe query, connection included. Default 5s. */
  readonly timeoutMs?: number;
  /**
   * Restricts the probe to these schemas instead of every
   * `store_mgmt_tenant_%` in the database.
   *
   * Matches `migrateTenantFleet`, `sweepStrandedAssignments` and
   * `tenant-orphan-sweep`, all three of which have always accepted it. This
   * one did not, which is what made its blast radius the whole database: it
   * had no way to be told which tenants it was actually responsible for, and
   * no way for a spec to avoid asserting over schemas some other spec had
   * created.
   */
  readonly tenantSchemas?: readonly string[];
}

/**
 * Surveys schema currency. NEVER throws for a drift finding — the caller
 * decides the consequence, and the two callers decide differently
 * (`reportTenantSchemaCurrency` logs, `TenantSchemaCurrencyService` refuses
 * one tenant's requests).
 */
export async function surveyTenantSchemaCurrency(
  options: SurveyTenantSchemaCurrencyOptions,
): Promise<SchemaCurrencySurvey> {
  let probed: ProbeResult;
  try {
    probed = await probeTenantEnumLabels(
      options.connectionString,
      options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
      options.tenantSchemas,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'unknown',
      schemaNames: [],
      gaps: [],
      message:
        `Tenant schema drift probe could not run (${message}). ` +
        'Run `node scripts/tenant-migrate.ts --check` (in packages/infra-db) to verify the fleet.',
    };
  }

  if (probed.schemaNames.length === 0) {
    return {
      status: 'unknown',
      schemaNames: [],
      gaps: [],
      message:
        `Tenant schema drift probe found NO "${SCHEMA_PREFIX}%" schemas — currency could not be ` +
        'established. Check that DATABASE_URL points at the database that holds the tenant fleet.',
    };
  }

  const gaps = findEnumLabelGaps(probed.schemaNames, probed.rows);
  const drift = describeEnumLabelGaps(gaps);
  if (drift === null) {
    return {
      status: 'current',
      schemaNames: probed.schemaNames,
      gaps: [],
      message: `Tenant schema drift probe: ${probed.schemaNames.length} tenant schema(s) current.`,
    };
  }
  return { status: 'behind', schemaNames: probed.schemaNames, gaps, message: drift };
}

export interface ReportTenantSchemaCurrencyOptions extends SurveyTenantSchemaCurrencyOptions {
  readonly mode: SchemaCurrencyMode;
  /** Defaults to `console` — injected in specs so the log/warn split is observable. */
  readonly logger?: Pick<Console, 'log' | 'warn'>;
}

/**
 * The BOOT-time call. Logs the survey and RETURNS IT. Never throws, in any
 * mode, for any status.
 *
 * This is the whole of item 1's owner decision: the boot path lost its power
 * to take the API down. A fleet-wide finding is fleet-wide INFORMATION; the
 * decision to refuse a request belongs to the request, where it can be scoped
 * to the one tenant the finding is about.
 */
export async function reportTenantSchemaCurrency(
  options: ReportTenantSchemaCurrencyOptions,
): Promise<SchemaCurrencySurvey> {
  const logger = options.logger ?? console;
  if (options.mode === 'off') {
    const message = `${SCHEMA_CURRENCY_ENV}=off — skipping the tenant schema drift probe.`;
    logger.log(message);
    return { status: 'unknown', schemaNames: [], gaps: [], message };
  }

  const survey = await surveyTenantSchemaCurrency(options);
  if (survey.status === 'current') {
    logger.log(survey.message);
  } else {
    logger.warn(
      survey.status === 'behind'
        ? `${survey.message}\nBooting anyway: the affected tenant(s) are refused at request time ` +
            `when ${SCHEMA_CURRENCY_ENV}=enforce, never the whole process.`
        : `${survey.message} — booting anyway.`,
    );
  }
  return survey;
}

export interface TenantSchemaCurrencyOptions {
  /** Defaults to `DATABASE_URL`. */
  readonly connectionString?: string;
  /** Defaults to `resolveSchemaCurrencyMode(process.env[SCHEMA_CURRENCY_ENV])`. */
  readonly mode?: SchemaCurrencyMode;
  readonly timeoutMs?: number;
  /** Defaults to `console`. */
  readonly logger?: Pick<Console, 'log' | 'warn'>;
}

/**
 * THE GATE, per tenant and per request.
 *
 * `TenantContextGuard` calls `assertSchemaCurrent(schemaName)` once the
 * request's schema is resolved and BEFORE any tenant query runs. At
 * `enforce`, a schema with an established gap gets `TenantSchemaBehindError`
 * — mapped to 503 by the guard — for its own requests only. Every other
 * tenant is untouched, which is the property the boot gate could not have.
 *
 * CACHED, per schema, so this is not a per-request round trip:
 *
 *   - `current` is cached for the process's lifetime. A schema does not lose
 *     enum labels.
 *   - `behind` is cached for `BEHIND_VERDICT_TTL_MS` and then re-probed, so
 *     running the migration heals the tenant without a restart.
 *   - `unknown` is NEVER cached. "I could not check" must not become a
 *     sticky answer, in either direction.
 *
 * Concurrent first requests for the same schema share ONE in-flight probe
 * (`inFlight`), so a cold cache under load is one query, not one per request.
 */
@Injectable()
export class TenantSchemaCurrencyService {
  // Keyed by schema, so these are bounded by the tenant count — the same bound
  // `TenantPrismaFactory`'s cache lives under, minus the connections.
  private readonly verdicts = new Map<string, { readonly survey: SchemaCurrencySurvey; readonly at: number }>();
  private readonly inFlight = new Map<string, Promise<SchemaCurrencySurvey>>();
  private readonly warned = new Set<string>();

  /**
   * `@Optional()` for the same reason `TenantPrismaFactory`'s constructor
   * carries it: `TenantSchemaCurrencyOptions` is a plain interface, so
   * `emitDecoratorMetadata` reports this parameter's design-time type as bare
   * `Object` and Nest's real DI container would try to resolve a provider for
   * it and throw before the `= {}` default could apply.
   */
  constructor(@Optional() private readonly options: TenantSchemaCurrencyOptions = {}) {
    // Resolved ONCE, here, and NOT per request.
    //
    // `resolveSchemaCurrencyMode` now throws on an unrecognised value, which
    // is right — but reading it on the request path would mean a typo'd
    // `TENANT_SCHEMA_DRIFT_CHECK` turned EVERY request for EVERY tenant into a
    // 500. That is the same fleet-wide blast radius this whole item exists to
    // remove, reintroduced one layer down. A config error is not data
    // dependent: it fails identically on every replica, immediately, and the
    // honest place to fail on it is construction (i.e. boot), where the
    // operator sees it before any traffic arrives. `main.ts` resolves the same
    // value for the same reason.
    this.mode = options.mode ?? resolveSchemaCurrencyMode(process.env[SCHEMA_CURRENCY_ENV]);
  }

  private readonly mode: SchemaCurrencyMode;

  async assertSchemaCurrent(schemaName: string): Promise<void> {
    const mode = this.mode;
    if (mode === 'off') {
      return;
    }
    const connectionString = this.options.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) {
      return;
    }

    const survey = await this.surveyCached(schemaName, connectionString);
    if (survey.status !== 'behind') {
      return;
    }
    if (mode === 'warn') {
      // Once per schema per verdict, not once per request: a stale tenant
      // under load would otherwise write the same paragraph to the log
      // thousands of times a minute and bury everything else.
      if (!this.warned.has(schemaName)) {
        this.warned.add(schemaName);
        (this.options.logger ?? console).warn(survey.message);
      }
      return;
    }
    throw new TenantSchemaBehindError(schemaName, survey.message);
  }

  /** Test seam: drops every cached verdict so the next call re-probes. */
  clearCache(): void {
    this.verdicts.clear();
    this.inFlight.clear();
    this.warned.clear();
  }

  private async surveyCached(
    schemaName: string,
    connectionString: string,
  ): Promise<SchemaCurrencySurvey> {
    const cached = this.verdicts.get(schemaName);
    if (cached && (cached.survey.status === 'current' || Date.now() - cached.at < BEHIND_VERDICT_TTL_MS)) {
      return cached.survey;
    }

    const existing = this.inFlight.get(schemaName);
    if (existing) {
      return existing;
    }

    const probe = surveyTenantSchemaCurrency({
      connectionString,
      tenantSchemas: [schemaName],
      ...(this.options.timeoutMs !== undefined ? { timeoutMs: this.options.timeoutMs } : {}),
    })
      .then((survey) => {
        // `unknown` is deliberately not cached — see the class doc comment.
        if (survey.status !== 'unknown') {
          this.verdicts.set(schemaName, { survey, at: Date.now() });
          if (survey.status === 'current') {
            this.warned.delete(schemaName);
          }
        }
        return survey;
      })
      .finally(() => {
        this.inFlight.delete(schemaName);
      });

    this.inFlight.set(schemaName, probe);
    return probe;
  }
}

interface ProbeResult {
  readonly schemaNames: readonly string[];
  readonly rows: readonly TenantEnumLabelRow[];
}

/**
 * ONE query for whatever set of schemas it was pointed at.
 *
 * The LEFT JOINs are load-bearing: a tenant schema that exists but carries no
 * enum types at all must still appear in `schemaNames`, or a wholly
 * unprovisioned schema would read as "nothing missing". They produce one row
 * with a null `type_name` for such a schema, which is dropped from `rows` and
 * kept in `schemaNames`.
 *
 * With no `tenantSchemas`, `LIKE 'store_mgmt_tenant_%'` mirrors
 * `listTenantSchemas` in `tenant-migrate.ts` verbatim, unescaped `_`
 * included — over-inclusive by a character, never under-inclusive. With
 * `tenantSchemas`, every name is `assertSchemaName`-validated and passed as a
 * BOUND PARAMETER; a name that is not a valid tenant schema name is refused
 * rather than probed for.
 *
 * `client.connect()` is INSIDE the try/finally. It used to sit outside it, so
 * a connect failure — the single most likely failure of this whole
 * function — left the `pg.Client` unclosed. That is the identical defect
 * `close-stranded-assignments.ts` fixed one file over, whose own doc comment
 * explains exactly why; this file had it too and was not swept.
 */
async function probeTenantEnumLabels(
  connectionString: string,
  timeoutMs: number,
  tenantSchemas?: readonly string[],
): Promise<ProbeResult> {
  let client: PgClient | undefined;
  try {
    for (const schemaName of tenantSchemas ?? []) {
      assertSchemaName(schemaName);
    }
    client = new PgClient({
      connectionString,
      connectionTimeoutMillis: timeoutMs,
      statement_timeout: timeoutMs,
      query_timeout: timeoutMs,
    });
    await client.connect();

    const scoped = tenantSchemas !== undefined;
    const { rows } = await client.query<{
      schema_name: string;
      type_name: string | null;
      label: string | null;
    }>(
      `
      SELECT n.nspname AS schema_name, t.typname AS type_name, e.enumlabel AS label
      FROM pg_namespace n
      LEFT JOIN pg_type t ON t.typnamespace = n.oid AND t.typtype = 'e'
      LEFT JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE ${scoped ? 'n.nspname = ANY($1::text[])' : 'n.nspname LIKE $1'}
      `,
      [scoped ? [...(tenantSchemas as readonly string[])] : `${SCHEMA_PREFIX}%`],
    );

    return {
      schemaNames: [...new Set(rows.map((row) => row.schema_name))].sort(),
      rows: rows
        .filter(
          (row): row is { schema_name: string; type_name: string; label: string } =>
            row.type_name !== null && row.label !== null,
        )
        .map((row) => ({ schemaName: row.schema_name, typeName: row.type_name, label: row.label })),
    };
  } finally {
    await client?.end().catch(() => undefined);
  }
}
