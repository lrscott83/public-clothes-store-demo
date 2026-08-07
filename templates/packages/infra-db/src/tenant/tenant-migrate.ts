import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client as PgClient } from 'pg';
import { assertSchemaName } from './schema-name.js';

const SCHEMA_PREFIX = 'store_mgmt_tenant_';

/**
 * Generous default — a real `prisma migrate diff` + apply against one tenant
 * normally finishes in well under a second. Overridable per call via
 * `TenantMigrationOptions.timeoutMs`, and per-tenant via
 * `timeoutOverridesMs` (test-only escape hatch, see its own doc comment).
 */
const DEFAULT_TIMEOUT_MS = 60_000;

export interface TenantMigratePaths {
  readonly toSchemaPath: string;
  readonly configPath: string;
  readonly packageRoot: string;
}

/**
 * Locates `prisma/tenant/schema.prisma` (plus its sibling `prisma.config.ts`
 * and the package root) by walking upward from `startDir`. Deliberately
 * takes the caller's OWN starting directory instead of computing one
 * internally: this module is loaded under TWO different module formats
 * depending on the caller — CommonJS under ts-jest (`tenant-migrate.spec.ts`)
 * and tsc's compiled `dist/` output, vs. true ESM when
 * `scripts/tenant-migrate.ts` dynamically imports it under Node's native
 * type-stripping (that file has top-level `import`/`export` syntax, which
 * Node's module-type auto-detection treats as ESM regardless of the
 * package's own CommonJS default — confirmed empirically: `__dirname` is
 * `ReferenceError`-undefined there). `__dirname` and `import.meta.url` are
 * each valid in exactly one of those two contexts, so NEITHER can be
 * referenced inside this file — every caller resolves its own starting
 * directory (`__dirname` from a CommonJS caller, or
 * `path.dirname(fileURLToPath(import.meta.url))` from an ESM one) and hands
 * it to this function, mirroring `tenant-database.service.ts`'s
 * `findTenantSchemaSqlPath` walk (same reason: build-depth differs between
 * `src/tenant` and compiled `dist/src/tenant`).
 */
export function resolveTenantMigratePaths(startDir: string): TenantMigratePaths {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'prisma', 'tenant', 'schema.prisma');
    if (fs.existsSync(candidate)) {
      return {
        toSchemaPath: candidate,
        configPath: path.join(path.dirname(candidate), 'prisma.config.ts'),
        // prisma/tenant/schema.prisma -> prisma/tenant -> prisma -> <package root>
        packageRoot: path.dirname(path.dirname(path.dirname(candidate))),
      };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate prisma/tenant/schema.prisma starting from ${startDir}`);
}

export type TenantMigrationMode = 'migrate' | 'check';

export type TenantMigrationStatus =
  | 'migrated'
  | 'in-sync'
  | 'behind'
  | 'refused-destructive'
  | 'timed-out'
  | 'error';

export interface TenantMigrationResult {
  readonly schemaName: string;
  readonly status: TenantMigrationStatus;
  /** Raw `migrate diff` output (SQL script in `migrate` mode, human-readable summary in `check` mode). */
  readonly diff?: string;
  readonly error?: string;
  readonly durationMs: number;
}

export interface TenantFleetMigrationReport {
  readonly mode: TenantMigrationMode;
  readonly results: readonly TenantMigrationResult[];
  /**
   * `true` when the run should exit non-zero: any timeout/error (both
   * modes), any refused-destructive statement (`migrate` mode), or any
   * drifted tenant (`check` mode). Never true just because SOME tenant
   * needed migrating and was migrated successfully.
   */
  readonly failed: boolean;
}

export interface TenantMigrationOptions {
  /** Base `DATABASE_URL`, with or without an existing `?schema=` — the tool overwrites it per tenant (design D6). */
  readonly connectionString: string;
  /** `migrate` (default) applies the diff. `check` only detects drift, never applies, never destructive. */
  readonly mode?: TenantMigrationMode;
  /**
   * Path to the tenant datamodel diffed against. Required, not defaulted
   * internally — see `resolveTenantMigratePaths`'s doc comment for why.
   * Production callers pass the real, committed `prisma/tenant/schema.prisma`;
   * tests may point elsewhere.
   */
  readonly toSchemaPath: string;
  /** Path to `prisma/tenant/prisma.config.ts`, passed as `--config` so `--from-config-datasource` resolves to it. Required, see `resolveTenantMigratePaths`. */
  readonly configPath: string;
  /** Working directory for the `prisma` child process — normally the package root. Required, see `resolveTenantMigratePaths`. */
  readonly cwd: string;
  /** Per-tenant wall-clock budget, in ms, for BOTH the diff subprocess and the apply transaction. Default 60s. */
  readonly timeoutMs?: number;
  /**
   * Test-only escape hatch: override `timeoutMs` for specific schema names.
   * Lets a spec force ONE real tenant's `prisma migrate diff` subprocess to
   * miss an impossibly small budget (e.g. 20ms — `npx prisma` cannot start
   * that fast) while every other tenant keeps the generous default, proving
   * "one tenant timing out does not block the others" against a REAL
   * process, not a mock.
   */
  readonly timeoutOverridesMs?: Readonly<Record<string, number>>;
  /** Applies even when the diff contains `DROP TABLE`/`DROP COLUMN`. Default `false` — `migrate` mode only. */
  readonly allowDestructive?: boolean;
  /** Overrides auto-discovery (`information_schema`) — for tests, and for scoping a run to a subset of the fleet. */
  readonly tenantSchemas?: readonly string[];
  /** Overrides `MINIMUM_SERVER_VERSION_NUM` — for tests only; production never lowers the floor. */
  readonly minimumServerVersionNum?: number;
}

/** Matches the two Prisma destructive DDL forms the spec names. Case-insensitive, word-boundaried. */
const DESTRUCTIVE_PATTERN = /\b(DROP\s+TABLE|DROP\s+COLUMN)\b/i;

/**
 * PostgreSQL 12.0, as `server_version_num` reports it.
 *
 * `applyDiff` runs the generated script inside an EXPLICIT `BEGIN`/`COMMIT`.
 * `ALTER TYPE ... ADD VALUE` — precisely what shipping a new enum value emits,
 * and what the `DeliveryAssignmentStatus.cancelled` migration IS — is illegal
 * inside a transaction block before PostgreSQL 12. On an older server the
 * tenant came back with status `error` carrying a raw driver message, which
 * reads like a bug in this tool rather than "this database is too old to
 * migrate". Asserted once, up front, in the tool's own vocabulary.
 */
export const MINIMUM_SERVER_VERSION_NUM = 120_000;

/** `server_version_num` (e.g. `160013`) rendered the way Postgres itself prints a version. */
function formatServerVersion(serverVersionNum: number): string {
  const major = Math.floor(serverVersionNum / 10_000);
  const minor = serverVersionNum % 10_000;
  return `${major}.${minor}`;
}

/**
 * `null` when `serverVersionNum` is supported; otherwise the message to
 * report. Pure, so the unsupported branch is testable without an ancient
 * Postgres to point at.
 */
export function describeUnsupportedServerVersion(
  serverVersionNum: number,
  minimum: number = MINIMUM_SERVER_VERSION_NUM,
): string | null {
  if (serverVersionNum >= minimum) {
    return null;
  }
  return (
    `PostgreSQL ${formatServerVersion(serverVersionNum)} is below the required ` +
    `${formatServerVersion(minimum)}: this tool applies each tenant's diff inside an explicit ` +
    'transaction, and ALTER TYPE ... ADD VALUE (emitted whenever an enum gains a value) is not ' +
    'allowed in a transaction block on older servers. Upgrade the server, or apply this tenant\'s ' +
    'diff by hand outside a transaction.'
  );
}

/**
 * What one connection to the fleet database establishes: which tenant schemas
 * exist, and what server version they live on.
 *
 * Both used to be read on SEPARATE connections — `listTenantSchemas` and
 * `readServerVersionNum` — and the version read ran on EVERY invocation
 * including `check` mode, outside any try/catch, so an unreachable database
 * threw straight out of `migrateTenantFleet`. That contradicts this module's
 * own contract that "one hung/slow tenant never prevents the rest of the
 * fleet from being attempted": a fleet-level connection failure is not a
 * tenant's problem, and it must be REPORTED, not thrown.
 *
 * `serverVersionNum` is `null` when it could not be read. A version nobody
 * could determine is not evidence of an unsupported one.
 */
interface FleetSurvey {
  readonly tenantSchemas: readonly string[];
  readonly serverVersionNum: number | null;
  readonly error?: string;
}

async function surveyFleet(connectionString: string): Promise<FleetSurvey> {
  let client: PgClient | undefined;
  try {
    client = new PgClient({ connectionString });
    await client.connect();
    const { rows: schemaRows } = await client.query<{ schema_name: string }>(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE $1 ORDER BY schema_name',
      [`${SCHEMA_PREFIX}%`],
    );
    const { rows: versionRows } = await client.query<{ server_version_num: string }>(
      'SHOW server_version_num',
    );
    return {
      tenantSchemas: schemaRows.map((r) => r.schema_name),
      serverVersionNum: Number(versionRows[0]?.server_version_num ?? 0),
    };
  } catch (err) {
    return {
      tenantSchemas: [],
      serverVersionNum: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client?.end().catch(() => undefined);
  }
}

/**
 * One migration tool, drift check is the same primitive in report mode
 * (design D6; spec salesops-tenancy "Single Migration Tool With Loud Drift
 * Detection"). Every tenant is processed SEQUENTIALLY (mirrors this
 * package's own `maxWorkers: 1` discipline against a shared Postgres
 * instance) with an independent per-tenant timeout — one hung/slow tenant
 * never prevents the rest of the fleet from being attempted.
 */
export async function migrateTenantFleet(options: TenantMigrationOptions): Promise<TenantFleetMigrationReport> {
  const mode = options.mode ?? 'migrate';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { toSchemaPath, configPath, cwd } = options;
  const allowDestructive = options.allowDestructive ?? false;

  // ONE connection for both fleet-level facts, and it cannot throw out of
  // this function — see `surveyFleet`.
  const survey = await surveyFleet(options.connectionString);
  const tenantSchemas = options.tenantSchemas ?? survey.tenantSchemas;

  // A fleet-level connection failure is reported, not thrown. With
  // `tenantSchemas` supplied by the caller there is still a list to report
  // against; with auto-discovery there is not, and an empty report carrying
  // `failed: true` is the honest answer.
  if (survey.error !== undefined) {
    return {
      mode,
      results: tenantSchemas.map((schemaName) => ({
        schemaName,
        status: 'error' as const,
        error: `Could not reach the fleet database: ${survey.error!}`,
        durationMs: 0,
      })),
      failed: true,
    };
  }

  // Asserted ONCE, before any tenant is touched. Too old a server cannot
  // apply an enum addition inside this tool's transaction, and every tenant
  // would have failed one at a time with a driver-level message that names
  // neither the version nor the reason.
  const unsupported = describeUnsupportedServerVersion(
    survey.serverVersionNum ?? MINIMUM_SERVER_VERSION_NUM,
    options.minimumServerVersionNum ?? MINIMUM_SERVER_VERSION_NUM,
  );
  if (unsupported !== null) {
    return {
      mode,
      results: tenantSchemas.map((schemaName) => ({
        schemaName,
        status: 'error' as const,
        error: unsupported,
        durationMs: 0,
      })),
      failed: true,
    };
  }

  const results: TenantMigrationResult[] = [];
  for (const schemaName of tenantSchemas) {
    const effectiveTimeoutMs = options.timeoutOverridesMs?.[schemaName] ?? timeoutMs;
     
    const result = await migrateOneTenant({
      schemaName,
      baseConnectionString: options.connectionString,
      mode,
      toSchemaPath,
      configPath,
      cwd,
      timeoutMs: effectiveTimeoutMs,
      allowDestructive,
    });
    results.push(result);
  }

  const failed = results.some((r) => isFailingStatus(mode, r.status));

  return { mode, results, failed };
}

function isFailingStatus(mode: TenantMigrationMode, status: TenantMigrationStatus): boolean {
  if (status === 'timed-out' || status === 'error') return true;
  if (mode === 'check') return status === 'behind';
  return status === 'refused-destructive';
}

interface MigrateOneTenantParams {
  readonly schemaName: string;
  readonly baseConnectionString: string;
  readonly mode: TenantMigrationMode;
  readonly toSchemaPath: string;
  readonly configPath: string;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly allowDestructive: boolean;
}

async function migrateOneTenant(params: MigrateOneTenantParams): Promise<TenantMigrationResult> {
  const { schemaName, baseConnectionString, mode, toSchemaPath, configPath, cwd, timeoutMs, allowDestructive } = params;

  const start = Date.now();
  const durationMs = (): number => Date.now() - start;

  try {
    // Defense in depth (design D3) — every interpolation site re-validates,
    // even though every caller here is expected to already have a
    // `store_mgmt_tenant_%`-derived name.
    //
    // INSIDE the try, with `withTenantSchema` (which parses a URL and can
    // throw on a malformed base connection string). Both used to sit outside
    // it, so either one threw straight out of `migrateTenantFleet`'s loop and
    // discarded every result already collected — directly contradicting this
    // module's own "one hung/slow tenant never prevents the rest of the fleet
    // from being attempted". A bad name is one tenant's problem; it is not
    // the fleet's.
    assertSchemaName(schemaName);
    const tenantUrl = withTenantSchema(baseConnectionString, schemaName);

    if (mode === 'check') {
      const diff = await runDiff({ tenantUrl, configPath, toSchemaPath, cwd, timeoutMs, exitCode: true, script: false });
      if (diff.timedOut) {
        return { schemaName, status: 'timed-out', durationMs: durationMs(), error: 'migrate diff timed out' };
      }
      if (diff.exitCode === 0) {
        return { schemaName, status: 'in-sync', durationMs: durationMs() };
      }
      if (diff.exitCode === 2) {
        return { schemaName, status: 'behind', diff: diff.stdout, durationMs: durationMs() };
      }
      return {
        schemaName,
        status: 'error',
        durationMs: durationMs(),
        error: `migrate diff exited with code ${diff.exitCode}`,
      };
    }

    // mode === 'migrate'
    const diff = await runDiff({ tenantUrl, configPath, toSchemaPath, cwd, timeoutMs, exitCode: false, script: true });
    if (diff.timedOut) {
      return { schemaName, status: 'timed-out', durationMs: durationMs(), error: 'migrate diff timed out' };
    }
    if (diff.exitCode !== 0) {
      return {
        schemaName,
        status: 'error',
        durationMs: durationMs(),
        error: `migrate diff exited with code ${diff.exitCode}`,
      };
    }
    if (isEmptyDiff(diff.stdout)) {
      return { schemaName, status: 'in-sync', durationMs: durationMs() };
    }
    // `migrate diff` has NO data-loss gate of its own (design D6, task
    // 11.1's spike) — it emits DROP TABLE/DROP COLUMN with zero warning and
    // zero refusal. This scan IS the guard; it is ours, not Prisma's.
    if (!allowDestructive && DESTRUCTIVE_PATTERN.test(diff.stdout)) {
      return { schemaName, status: 'refused-destructive', diff: diff.stdout, durationMs: durationMs() };
    }

    const applied = await applyDiff({ tenantUrl, schemaName, script: diff.stdout, timeoutMs });
    if (applied.timedOut) {
      return {
        schemaName,
        status: 'timed-out',
        diff: diff.stdout,
        durationMs: durationMs(),
        error: 'apply transaction timed out',
      };
    }
    if (applied.error) {
      return { schemaName, status: 'error', diff: diff.stdout, durationMs: durationMs(), error: applied.error };
    }

    return { schemaName, status: 'migrated', diff: diff.stdout, durationMs: durationMs() };
  } catch (err) {
    return {
      schemaName,
      status: 'error',
      durationMs: durationMs(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `-- This is an empty migration.` (in `migrate` mode's `--script` output)
 * is the only content an in-sync tenant produces — every meaningful
 * statement Prisma emits is a non-comment line. Confirmed empirically
 * (spike 11.1 follow-up, 2026-08-05) against a real Postgres schema applied
 * from the committed `prisma/tenant-schema.sql`.
 */
function isEmptyDiff(stdout: string): boolean {
  const meaningfulLines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'));
  return meaningfulLines.length === 0;
}

interface DiffOutcome {
  readonly stdout: string;
  /** `0` success/in-sync, `2` non-empty diff (`--exit-code` only), anything else a real `migrate diff` error. `-1` when `timedOut`. */
  readonly exitCode: number;
  readonly timedOut: boolean;
}

interface RunDiffParams {
  readonly tenantUrl: string;
  readonly configPath: string;
  readonly toSchemaPath: string;
  readonly cwd: string;
  readonly timeoutMs: number;
  /** `--exit-code`: `check` mode only — never combined with `script`, mirrors design D6's table. */
  readonly exitCode: boolean;
  /** `--script`: `migrate` mode only. */
  readonly script: boolean;
}

/**
 * Spawns one `prisma migrate diff` child process per tenant, with
 * `DATABASE_URL=<base>?schema=<tenant>` in ITS env only (task 11.1's spike:
 * there is no CLI flag left that accepts an arbitrary per-tenant URL —
 * `--from-config-datasource` takes no argument and reads
 * `prisma.config.ts`, which resolves `process.env.DATABASE_URL`).
 *
 * `execFile`'s own `timeout`/`killSignal` option is what actually enforces
 * the per-tenant budget — verified empirically (spike, 2026-08-05) to
 * reliably SIGKILL a still-running `npx prisma` subprocess and surface
 * `err.killed === true`, rather than merely abandoning it while it keeps
 * running in the background.
 */
function runDiff(params: RunDiffParams): Promise<DiffOutcome> {
  const { tenantUrl, configPath, toSchemaPath, cwd, timeoutMs, exitCode, script } = params;
  const args = [
    'prisma',
    'migrate',
    'diff',
    '--from-config-datasource',
    '--config',
    configPath,
    '--to-schema',
    toSchemaPath,
  ];
  if (script) args.push('--script');
  if (exitCode) args.push('--exit-code');

  return new Promise((resolve) => {
    execFile(
      'npx',
      args,
      {
        cwd,
        env: { ...process.env, DATABASE_URL: tenantUrl },
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed) {
          resolve({ stdout: '', exitCode: -1, timedOut: true });
          return;
        }
        if (err) {
          const code = typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1;
          resolve({ stdout: stdout ?? '', exitCode: code, timedOut: false });
          return;
        }
        resolve({ stdout: stdout ?? '', exitCode: 0, timedOut: false });
      },
    );
  });
}

interface ApplyDiffParams {
  readonly tenantUrl: string;
  readonly schemaName: string;
  readonly script: string;
  readonly timeoutMs: number;
}

interface ApplyOutcome {
  readonly timedOut: boolean;
  readonly error?: string;
}

/**
 * Applies the generated SQL via a raw `pg.Client` transaction (design D6:
 * `db execute --url` was removed from Prisma 7.8, no CLI applies our own
 * per-tenant URL). The generated DDL is schema-unqualified — `SET
 * search_path` first or it writes into `public` (same discipline as
 * `TenantDatabaseService.createSchema`). `statement_timeout`/`query_timeout`
 * on the client enforce the same per-tenant budget server-side, in case the
 * apply step itself is what hangs (not just the diff subprocess).
 */
async function applyDiff(params: ApplyDiffParams): Promise<ApplyOutcome> {
  const { tenantUrl, schemaName, script, timeoutMs } = params;
  assertSchemaName(schemaName);

  const client = new PgClient({
    connectionString: tenantUrl,
    statement_timeout: timeoutMs,
    query_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(`SET search_path TO "${schemaName}"`);
    await client.query(script);
    await client.query('COMMIT');
    return { timedOut: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    // Postgres `57014` = query_canceled (statement_timeout fired server-side).
    const timedOut = code === '57014' || /timeout/i.test(message);
    return timedOut ? { timedOut: true } : { timedOut: false, error: message };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Overwrites (or adds) `?schema=` on `baseConnectionString` — never assumes it was absent. */
export function withTenantSchema(baseConnectionString: string, schemaName: string): string {
  const url = new URL(baseConnectionString);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

