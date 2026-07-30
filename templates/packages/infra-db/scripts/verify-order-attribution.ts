// CLI wrapper for the migration B gate (design.md §8.3, task 3.13). The
// assertion logic lives in `src/sales/verify-order-attribution.ts` — it is
// library code with its own spec, and a gate that guards money should not be
// the one piece of the system nobody can test. This file is only argument
// handling and reporting.
//
// Run directly on Node 24's native TypeScript type-stripping — no build step,
// no ts-node/tsx, same spirit as `verify-company-user-backfill.ts`:
//
//   ATTRIBUTION_CUTOVER=2026-07-29T14:00:00Z node scripts/verify-order-attribution.ts
//
// Exits non-zero on ANY violation. This is the gate between attribution
// (migration A, reversible) and the commission ledger (migration B, which is
// irreversible once anything settles). Migration B MUST NOT be run until this
// passes against the target database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOrderAttribution } from '../src/sales/verify-order-attribution.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(SCRIPT_DIR, '..');

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

async function main(): Promise<void> {
  const connectionString = process.env.VERIFY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot run the attribution verification.');
    process.exitCode = 1;
    return;
  }

  // No default cutover on purpose: guessing it wrong silently turns the
  // post_cutover_nulls assertion into a no-op, which is worse than no gate at
  // all because it reports PASS.
  const rawCutover = process.env.ATTRIBUTION_CUTOVER;
  if (!rawCutover) {
    console.error(
      'ATTRIBUTION_CUTOVER is not set. Pass the timestamp at which migration A was applied to this ' +
        'database, e.g. ATTRIBUTION_CUTOVER=2026-07-29T14:00:00Z.',
    );
    process.exitCode = 1;
    return;
  }
  const cutover = new Date(rawCutover);
  if (Number.isNaN(cutover.getTime())) {
    console.error(`ATTRIBUTION_CUTOVER is not a valid timestamp: "${rawCutover}"`);
    process.exitCode = 1;
    return;
  }

  const report = await verifyOrderAttribution(connectionString, cutover);

  // Reported, never asserted: orders predating the cutover legitimately have
  // no agent, and backfilling one would fabricate financial evidence.
  console.log(
    `${report.orders} order(s) total; ${report.legacyUnattributed} legacy unattributed (expected, not a failure); ` +
      `${report.postCutoverOrders} created after the cutover.`,
  );

  if (report.failures.length > 0) {
    console.error('Attribution verification FAILED — do NOT run migration B:');
    for (const failure of report.failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  // A pass over zero rows is not a pass. The assertion this gate exists to make
  // is vacuously true on an empty table, so reporting PASSED here would hand
  // migration B a green light backed by no evidence at all — and B is the one
  // that stops being reversible the moment anything settles.
  if (report.postCutoverOrders === 0) {
    console.error(
      'Attribution verification INCONCLUSIVE — do NOT run migration B: no order in this database was ' +
        'created after the cutover, so the "every post-cutover order carries an attribution" assertion ' +
        'examined nothing. Point this at a database with real post-cutover traffic, or place at least ' +
        'one attributed order through the live delivery path first.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Attribution verification PASSED over ${report.postCutoverOrders} post-cutover order(s): ` +
      '0 orphans, 0 post-cutover nulls. Migration B may proceed.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
