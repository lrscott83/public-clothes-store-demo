// CLI wrapper for the design D7 orphan reconciliation tool (task 10.3). The
// sweep logic lives in `src/tenant/tenant-orphan-sweep.ts` — it is library
// code with its own real-Postgres spec; this file is only argument handling
// and reporting, same split as `verify-order-attribution.ts`.
//
// Run directly on Node 24's native TypeScript type-stripping — no build
// step, no ts-node/tsx, same spirit as `verify-company-user-backfill.ts`:
//
//   node scripts/tenant-orphan-sweep.ts                    # report only, changes NOTHING
//   node scripts/tenant-orphan-sweep.ts --allow-destructive # also reconciles what it found
//   node scripts/tenant-orphan-sweep.ts --grace-minutes=30  # widen the in-flight-saga window (default 15)
//
// Defaults to REPORTING ONLY (design D6's `--allow-destructive` discipline,
// mirrored here) — this tool changes nothing unless told to. Exits non-zero
// only on an execution error (e.g. cannot reach the database); finding
// orphans is this tool doing its job, not a failure, so it always exits 0
// on a clean run regardless of what it found.

import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TenantOrphanSweepReport } from '../src/tenant/tenant-orphan-sweep.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(SCRIPT_DIR, '..');

// Bridges Node's native type-stripping (no build step) against `src/`'s
// NodeNext-style `.js` relative imports — see `ts-relative-import-loader.mjs`
// for the full why. Registered before the dynamic `import()` below runs; a
// STATIC top-level import of `sweepTenantOrphans` would resolve before this
// line even executes (module graphs link before the importing file's body
// runs) and reproduce the exact `ERR_MODULE_NOT_FOUND` this works around —
// that is why the value import below is dynamic and `await`ed, not static.
register(new URL('./ts-relative-import-loader.mjs', import.meta.url));
const { sweepTenantOrphans } = (await import('../src/tenant/tenant-orphan-sweep.ts')) as {
  sweepTenantOrphans: (
    connectionString: string,
    options?: { allowDestructive?: boolean; graceMinutes?: number },
  ) => Promise<TenantOrphanSweepReport>;
};

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

function parseGraceMinutes(argv: string[]): number | undefined {
  const flag = argv.find((arg) => arg.startsWith('--grace-minutes='));
  if (!flag) return undefined;
  const value = Number(flag.slice('--grace-minutes='.length));
  if (!Number.isFinite(value) || value < 0) {
    console.error(`Invalid --grace-minutes value: "${flag}"`);
    process.exitCode = 1;
    return undefined;
  }
  return value;
}

function printSchemaFindings(report: TenantOrphanSweepReport): void {
  console.log(`\nClass 1 — orphan schemas (no Company row claims them): ${report.orphanSchemas.length}`);
  for (const f of report.orphanSchemas) {
    const dropped = report.reconciled.schemasDropped.includes(f.schemaName);
    console.log(`  - ${f.schemaName}${dropped ? ' [DROPPED]' : ''}`);
  }

  console.log(`\nClass 2 — dangling Company.schemaName (schema does not exist): ${report.danglingCompanySchemas.length}`);
  for (const f of report.danglingCompanySchemas) {
    const cleared = report.reconciled.companySchemaNamesCleared.includes(f.companyId);
    console.log(`  - company=${f.companyId} schemaName=${f.schemaName}${cleared ? ' [CLEARED]' : ''}`);
  }
}

function printMembershipFindings(report: TenantOrphanSweepReport): void {
  console.log(`\nClass 3 — ACTIVE Membership with no tenant CompanyUser: ${report.orphanMemberships.length}`);
  for (const f of report.orphanMemberships) {
    const deleted = report.reconciled.membershipsDeleted.includes(f.membershipId);
    console.log(
      `  - membership=${f.membershipId} user=${f.userId} company=${f.companyId} createdAt=${f.createdAt.toISOString()}${deleted ? ' [DELETED]' : ''}`,
    );
  }

  if (report.inFlightMemberships.length > 0) {
    console.log(
      `\n${report.inFlightMemberships.length} Membership(s) look the same but are still inside the grace ` +
        'window — reported only, NEVER reconciled (cannot tell an orphan from a saga mid-flight between ' +
        'steps 4 and 5):',
    );
    for (const f of report.inFlightMemberships) {
      console.log(
        `  - membership=${f.membershipId} user=${f.userId} company=${f.companyId} age=${f.ageMinutes.toFixed(1)}min`,
      );
    }
  }
}

function printIncidents(report: TenantOrphanSweepReport): void {
  if (report.unresolvedIncidents.length === 0) return;
  console.log(`\n${report.unresolvedIncidents.length} unresolved ProvisioningIncident(s) on record (informational, cross-reference only):`);
  for (const i of report.unresolvedIncidents) {
    console.log(`  - company=${i.companyId} step="${i.step}" reason="${i.reason}" at ${i.createdAt.toISOString()}`);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot run the orphan sweep.');
    process.exitCode = 1;
    return;
  }

  const allowDestructive = process.argv.includes('--allow-destructive');
  const graceMinutes = parseGraceMinutes(process.argv);
  if (process.exitCode === 1) return; // parseGraceMinutes already reported the error

  console.log(
    allowDestructive
      ? 'Running tenant orphan sweep in RECONCILE mode (--allow-destructive) — matching findings will be fixed.'
      : 'Running tenant orphan sweep in REPORT-ONLY mode — nothing will be changed. Pass --allow-destructive to reconcile.',
  );

  const report = await sweepTenantOrphans(connectionString, { allowDestructive, graceMinutes });

  printSchemaFindings(report);
  printMembershipFindings(report);
  printIncidents(report);

  const totalFindings =
    report.orphanSchemas.length + report.danglingCompanySchemas.length + report.orphanMemberships.length;
  console.log(
    `\n${totalFindings === 0 ? 'Clean — no orphans found.' : `${totalFindings} orphan(s) found.`}` +
      (allowDestructive
        ? ` Reconciled: ${report.reconciled.schemasDropped.length} schema(s) dropped, ` +
          `${report.reconciled.companySchemaNamesCleared.length} Company.schemaName cleared, ` +
          `${report.reconciled.membershipsDeleted.length} Membership(s) deleted.`
        : ''),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
