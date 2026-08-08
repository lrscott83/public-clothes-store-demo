// CLI wrapper for the design D6 fleet migration tool (task 11.3). The
// migration/drift logic lives in `src/tenant/tenant-migrate.ts` — it is
// library code with its own real-Postgres spec; this file is only argument
// handling and reporting, same split as `tenant-orphan-sweep.ts` (task 10.3).
//
// Run directly on Node's native TypeScript type-stripping — no build step,
// same spirit as every other `scripts/*.ts` here:
//
//   node scripts/tenant-migrate.ts                       # apply drift to every tenant, refuses destructive statements
//   node scripts/tenant-migrate.ts --allow-destructive    # apply drift, including DROP TABLE/DROP COLUMN
//   node scripts/tenant-migrate.ts --check                # report-only drift check (CI + startup assertion), never applies
//   node scripts/tenant-migrate.ts --timeout-ms=120000     # override the per-tenant budget (default 60000)
//
// One migration tool; the drift check is the SAME primitive in report mode
// (design.md D6) — this file is the single entrypoint for both.

import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  TenantFleetMigrationReport,
  TenantMigratePaths,
  TenantMigrationMode,
} from '../src/tenant/tenant-migrate.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(SCRIPT_DIR, '..');

// Bridges Node's native type-stripping (no build step) against `src/`'s
// NodeNext-style `.js` relative imports — see `ts-relative-import-loader.mjs`
// for the full why. Registered before the dynamic `import()` below runs; a
// STATIC top-level import of `migrateTenantFleet` would resolve before this
// line even executes (module graphs link before the importing file's body
// runs) and reproduce the exact `ERR_MODULE_NOT_FOUND` this works around —
// same precedent as `scripts/tenant-orphan-sweep.ts`.
register(new URL('./ts-relative-import-loader.mjs', import.meta.url));
const { migrateTenantFleet, resolveTenantMigratePaths } = (await import('../src/tenant/tenant-migrate.ts')) as {
  migrateTenantFleet: (options: {
    connectionString: string;
    mode?: TenantMigrationMode;
    toSchemaPath: string;
    configPath: string;
    cwd: string;
    timeoutMs?: number;
    allowDestructive?: boolean;
  }) => Promise<TenantFleetMigrationReport>;
  resolveTenantMigratePaths: (startDir: string) => TenantMigratePaths;
};

// This file has top-level `import`/`export` syntax, so Node's native
// type-stripping loader treats it (and every module it dynamically imports)
// as true ESM, regardless of the package's CommonJS default — `__dirname`
// does not exist here. `resolveTenantMigratePaths`'s own doc comment is the
// full why this resolution lives at each call site instead of inside the
// library. `SCRIPT_DIR` (this file's own directory) is enough: it walks
// upward to find `prisma/tenant/schema.prisma`.
const MIGRATE_PATHS = resolveTenantMigratePaths(SCRIPT_DIR);

/** See `verify-company-user-backfill.ts` — same manual `.env` parse, same precedence rules. */
function loadDotEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.join(PACKAGE_ROOT, '.env'));

function parseTimeoutMs(argv: string[]): number | undefined {
  const flag = argv.find((arg) => arg.startsWith('--timeout-ms='));
  if (!flag) return undefined;
  const value = Number(flag.slice('--timeout-ms='.length));
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`Invalid --timeout-ms value: "${flag}"`);
    process.exitCode = 1;
    return undefined;
  }
  return value;
}

function printReport(report: TenantFleetMigrationReport): void {
  const verb = report.mode === 'check' ? 'Checked' : 'Migrated';
  console.log(`\n${verb} ${report.results.length} tenant(s):\n`);
  for (const r of report.results) {
    console.log(`  - ${r.schemaName}: ${r.status} (${r.durationMs}ms)`);
    if (r.error) console.log(`      error: ${r.error}`);
    if (r.diff && r.status !== 'in-sync') {
      const preview = r.diff.trim().split('\n').slice(0, 10).join('\n      ');
      console.log(`      diff:\n      ${preview}`);
    }
  }
  console.log(
    `\n${report.failed ? 'FAILED' : 'OK'} — ${report.results.filter((r) => r.status === 'in-sync').length} in sync, ` +
      `${report.results.filter((r) => r.status === 'migrated').length} migrated, ` +
      `${report.results.filter((r) => r.status === 'behind').length} behind, ` +
      `${report.results.filter((r) => r.status === 'refused-destructive').length} refused (destructive), ` +
      `${report.results.filter((r) => r.status === 'timed-out').length} timed out, ` +
      `${report.results.filter((r) => r.status === 'error').length} errored.`,
  );
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot run the fleet migration tool.');
    process.exitCode = 1;
    return;
  }

  const mode: TenantMigrationMode = process.argv.includes('--check') ? 'check' : 'migrate';
  const allowDestructive = process.argv.includes('--allow-destructive');
  const timeoutMs = parseTimeoutMs(process.argv);
  if (process.exitCode === 1) return; // parseTimeoutMs already reported the error

  console.log(
    mode === 'check'
      ? 'Running tenant fleet drift check (--check) — report only, nothing will be applied.'
      : allowDestructive
        ? 'Running tenant fleet migration WITH --allow-destructive — DROP TABLE/DROP COLUMN statements will be applied.'
        : 'Running tenant fleet migration — destructive statements will be refused unless --allow-destructive is passed.',
  );

  const report = await migrateTenantFleet({
    connectionString,
    mode,
    timeoutMs,
    allowDestructive,
    toSchemaPath: MIGRATE_PATHS.toSchemaPath,
    configPath: MIGRATE_PATHS.configPath,
    cwd: MIGRATE_PATHS.packageRoot,
  });

  printReport(report);

  process.exitCode = report.failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
