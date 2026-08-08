// CLI wrapper for the one-shot DELIVERY data migration (CLASS F3). The sweep
// logic lives in `src/tenant/close-stranded-assignments.ts` — it is library
// code with its own real-Postgres spec; this file is only argument handling
// and reporting, same split as `tenant-migrate.ts` and `tenant-orphan-sweep.ts`.
//
// Run directly on Node's native TypeScript type-stripping — no build step:
//
//   node scripts/tenant-close-stranded-assignments.ts                     # report only, changes NOTHING
//   node scripts/tenant-close-stranded-assignments.ts --allow-destructive # closes what it found
//
// WHAT IT FIXES: `DeliveryAssignment` rows left `in_transit` behind an order
// that was `cancelled` before `cancelAssignmentOnOrderCancelTx` existed. Those
// rows report their carrier BUSY forever in `computeCarrierCapacity`, hide
// their order from `countOrdersAwaitingCarrier`'s anti-join, cannot be closed
// through any API path, and — since the carrier deactivation guard became
// real — now also block `DELETE /delivery/carriers/:id` for that carrier
// permanently.
//
// ===========================================================================
// DEPLOY ORDER FOR THIS RELEASE — all three steps, in this order:
//
//   1. node scripts/tenant-migrate.ts
//        Adds `cancelled` to `DeliveryAssignmentStatus` in every tenant.
//        RUN IT BEFORE DEPLOYING THE NEW BUILD. Not because anything refuses
//        to start — nothing does — but because a tenant that is behind will
//        500 on `POST /orders/:id/cancel` for every one of its orders until
//        this has run.
//
//        WHAT THE APP ACTUALLY DOES, precisely (this block used to claim the
//        app "will refuse to boot against a fleet that is behind", which was
//        never quite true and is now not true at all):
//
//          - At boot, `reportTenantSchemaCurrency` LOGS a fleet-wide summary
//            and returns. It cannot refuse boot, in any mode. It previously
//            could, with `enforce` as the default and no scoping, so one
//            tenant missing a label refused boot for every tenant — which is
//            reachable by an ordinary rolling deploy, since `api-idp`
//            provisions tenant schemas at runtime from its own image's
//            bundled DDL.
//          - Per REQUEST, `TenantContextGuard` refuses the affected tenant
//            with 503 — and only that tenant — when
//            `TENANT_SCHEMA_DRIFT_CHECK=enforce`. The DEFAULT is `warn`,
//            which logs once per stale schema and serves the request.
//          - Either way the probe checks ENUM LABELS ONLY, not column-level
//            drift. `node scripts/tenant-migrate.ts --check` is the full
//            check; run it in CI or at deploy time.
//
//   2. Deploy the application build.
//
//   3. node scripts/tenant-close-stranded-assignments.ts            (review)
//      node scripts/tenant-close-stranded-assignments.ts --allow-destructive
//        Closes the pre-existing stranded rows. Safe to run at any point
//        after step 1, and idempotent — a second run finds nothing.
//
// Running step 3 before step 1 reports every tenant as an error (no enum
// value to write). Running step 2 before step 1 leaves the un-migrated
// tenants 500ing on cancels — which the boot log names and, at
// `TENANT_SCHEMA_DRIFT_CHECK=enforce`, the request path turns into a clean
// 503 for those tenants alone.
// ===========================================================================

import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StrandedAssignmentSweepReport } from '../src/tenant/close-stranded-assignments.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(SCRIPT_DIR, '..');

// Bridges Node's native type-stripping (no build step) against `src/`'s
// NodeNext-style `.js` relative imports — see `ts-relative-import-loader.mjs`.
// The value import below MUST stay dynamic and `await`ed: a static one would
// resolve before this `register` call runs.
register(new URL('./ts-relative-import-loader.mjs', import.meta.url));
const { sweepStrandedAssignments } = (await import('../src/tenant/close-stranded-assignments.ts')) as {
  sweepStrandedAssignments: (
    connectionString: string,
    options?: { allowDestructive?: boolean },
  ) => Promise<StrandedAssignmentSweepReport>;
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

function printReport(report: StrandedAssignmentSweepReport, allowDestructive: boolean): void {
  let totalFindings = 0;
  let totalClosed = 0;

  console.log(`\nSwept ${report.results.length} tenant(s):\n`);
  for (const result of report.results) {
    totalFindings += result.findings.length;
    totalClosed += result.closed.length;
    if (result.error) {
      console.log(`  - ${result.schemaName}: ERROR — ${result.error}`);
      continue;
    }
    console.log(
      `  - ${result.schemaName}: ${result.findings.length} stranded assignment(s)` +
        (allowDestructive ? `, ${result.closed.length} closed` : ''),
    );
    for (const finding of result.findings) {
      console.log(
        `      assignment=${finding.assignmentId} order=${finding.orderId} ` +
          `carrier=${finding.carrierId} assignedAt=${finding.assignedAt.toISOString()}` +
          (result.closed.includes(finding.assignmentId) ? ' [CLOSED]' : ''),
      );
    }
  }

  console.log(
    `\n${totalFindings === 0 ? 'Clean — no stranded assignments found.' : `${totalFindings} stranded assignment(s) found.`}` +
      (allowDestructive ? ` Closed ${totalClosed}.` : ' Pass --allow-destructive to close them.'),
  );
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot sweep stranded delivery assignments.');
    process.exitCode = 1;
    return;
  }

  const allowDestructive = process.argv.includes('--allow-destructive');
  console.log(
    allowDestructive
      ? 'Closing stranded in_transit assignments behind cancelled orders (--allow-destructive).'
      : 'Running in REPORT-ONLY mode — nothing will be changed. Pass --allow-destructive to close them.',
  );

  const report = await sweepStrandedAssignments(connectionString, { allowDestructive });
  printReport(report, allowDestructive);

  // Finding stranded rows is this tool doing its job. Only a tenant that
  // could not be processed at all is a failure (mirrors `tenant-orphan-sweep.ts`).
  process.exitCode = report.failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
