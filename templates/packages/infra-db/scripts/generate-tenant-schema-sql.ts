// Generates the committed `prisma/tenant-schema.sql` artifact from
// `prisma/tenant/schema.prisma` via `prisma migrate diff --from-empty`
// (design.md D6; task 3.3). Run directly via
// `node scripts/generate-tenant-schema-sql.ts` — Node 24's native
// TypeScript type-stripping means no build step, no ts-node/tsx dependency,
// same "run scripts straight against the DB" spirit as `prisma/seed.js`
// and `scripts/verify-company-user-backfill.ts`.
//
// `--from-empty --to-schema` is a pure schema-to-schema diff — it opens NO
// database connection (verified by task 11.1's spike; the emitted SQL
// depends only on the schema file, not on any live Postgres state). Safe to
// run at any time, including with no reachable Postgres instance and
// without touching any existing tenant schema.
//
// The generated DDL is schema-unqualified ("CREATE TABLE \"category\"", not
// "\"tenant_x\".\"category\"") — every consumer MUST `SET search_path` to
// the target tenant schema before applying it (design.md D6/D7;
// `TenantDatabaseService`, Phase 4).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(SCRIPT_DIR, '..');
const TENANT_SCHEMA_PATH = path.join(PACKAGE_ROOT, 'prisma', 'tenant', 'schema.prisma');
const OUTPUT_PATH = path.join(PACKAGE_ROOT, 'prisma', 'tenant-schema.sql');

function generateSql(): string {
  // Invoked as `node <package>/node_modules/prisma/build/index.js` rather
  // than through `npx`: on Windows there is no exec-able `npx` binary (only
  // an `npx.cmd` shim `execFileSync` cannot spawn), so the script fails with
  // ENOENT there. Pointing Node at the same JS entrypoint `npx` wraps is
  // identical on every platform (same fix as `src/tenant/tenant-migrate.ts`).
  return execFileSync(
    process.execPath,
    [
      path.join(PACKAGE_ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      TENANT_SCHEMA_PATH,
      '--script',
    ],
    { cwd: PACKAGE_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
}

/**
 * Prisma cannot model a raw SQL `CHECK` constraint, so `migrate diff` never
 * emits one — this repo's established convention (see
 * `prisma/migrations/20260721201406_add_inventory_module/migration.sql` and
 * `prisma/migrations/20260723000000_stock_level_reserved_le_onhand/migration.sql`)
 * is to hand-append them after the generated DDL. Both constrain `stock_level`,
 * a tenant-side table (design.md §1), so they belong here, not in the master
 * migration.
 */
const HAND_APPENDED_CHECK_CONSTRAINTS = `-- AddCheck (defense-in-depth backstop for the guarded conditional UPDATE in
-- PrismaStockMovementRepository.record — design.md decision #4). Prisma has
-- no CHECK construct; hand-appended per this repo's convention, mirroring
-- prisma/migrations/20260721201406_add_inventory_module/migration.sql.
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_non_negative_check" CHECK ("on_hand" >= 0 AND "reserved" >= 0);

-- Defense-in-depth DB invariant (SDD follow-up W4): \`reserved\` can never
-- exceed \`on_hand\`. An IMMEDIATE (non-deferrable) CHECK — evaluated on
-- EVERY row modification, not at COMMIT. Hand-appended per this repo's
-- convention, mirroring
-- prisma/migrations/20260723000000_stock_level_reserved_le_onhand/migration.sql.
ALTER TABLE "stock_level"
  ADD CONSTRAINT "stock_level_reserved_le_on_hand_check" CHECK ("reserved" <= "on_hand");
`;

function main(): void {
  const sql = generateSql();

  const header = `-- GENERATED FILE — do not hand-edit.
-- Regenerate with: node scripts/generate-tenant-schema-sql.ts
-- Source: prisma/tenant/schema.prisma
--
-- Schema-unqualified DDL. The caller MUST \`SET search_path\` to the target
-- tenant schema before applying this file (design.md D6/D7) — it is not
-- scoped to any schema on its own.

`;

  fs.writeFileSync(OUTPUT_PATH, header + sql + '\n' + HAND_APPENDED_CHECK_CONSTRAINTS);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUTPUT_PATH} (${sql.split('\n').length} lines of generated SQL)`);
}

main();
