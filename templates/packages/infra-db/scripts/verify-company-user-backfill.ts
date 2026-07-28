// Verification gate for migration 001 (design.md §7, task 1.12). Hand-written
// SQL (not the Prisma client) because the assertions cross the
// `app_user`/`company_user` boundary that the generated client doesn't
// reason about in one query. Run directly via
// `node scripts/verify-company-user-backfill.ts` — Node 24's native
// TypeScript type-stripping means no build step, no ts-node/tsx dependency,
// same "run scripts straight against the DB" spirit as `prisma/seed.js`.
//
// Exits non-zero on ANY violation. This is the ONLY gate between the cheap
// rollback regime (migration 001 only, a pure code revert) and the expensive
// one (migration 002, `ALTER TABLE app_user DROP COLUMN roles`, which needs
// data recovery to undo). Migration 002 MUST NOT be authored or run until
// this script passes against the target database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(SCRIPT_DIR, '..');

/**
 * Mirrors `jest.setup.js`/`prisma.config.ts`: parse `.env` manually so this
 * script works whether run under plain `node` or invoked from a context
 * where `process.loadEnvFile` isn't available. Real environment variables
 * (e.g. CI, or an explicit `DATABASE_URL=... node ...` invocation) always
 * take precedence — never override an already-set value.
 */
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

interface VerificationRow {
  readonly companies: string;
  readonly users: string;
  readonly company_users: string;
  readonly mismatched_roles: string;
  readonly orphans: string;
}

/**
 * Runs the §7 assertions against `connectionString` and returns a list of
 * human-readable failure messages (empty = verification passed). Exported so
 * `verify-company-user-backfill.spec.ts` can exercise the assertion logic
 * against the real integration test database without spawning a subprocess.
 */
export async function verifyCompanyUserBackfill(connectionString: string): Promise<string[]> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // The gate compares `company_user.role` to `app_user.roles`, so it is
    // only meaningful in the window between migrations 001 and 002. This
    // script stays in the tree because environments roll out on their own
    // schedule — a database that has 001 but not 002 still needs it.
    const { rows: columns } = await client.query<{ n: string }>(`
      SELECT count(*) AS n FROM information_schema.columns
      WHERE table_name = 'app_user' AND column_name = 'roles';
    `);
    if (Number(columns[0].n) === 0) {
      return [
        'app_user.roles no longer exists — migration 002 has already run against this database, ' +
          'so there is nothing left to compare. This gate only applies between migrations 001 and 002.',
      ];
    }

    const { rows } = await client.query<VerificationRow>(`
      SELECT
        (SELECT count(*) FROM "company")                                      AS companies,
        (SELECT count(*) FROM "app_user")                                     AS users,
        (SELECT count(*) FROM "company_user")                                 AS company_users,
        (SELECT count(*) FROM "app_user" u JOIN "company_user" cu
           ON cu.user_id = u.id AND cu.role <> u.roles)                       AS mismatched_roles,
        (SELECT count(*) FROM "company_user" cu LEFT JOIN "app_user" u
           ON u.id = cu.user_id WHERE u.id IS NULL)                           AS orphans;
    `);

    const result = rows[0];
    const companies = Number(result.companies);
    const users = Number(result.users);
    const companyUsers = Number(result.company_users);
    const mismatchedRoles = Number(result.mismatched_roles);
    const orphans = Number(result.orphans);

    const failures: string[] = [];
    if (companies !== 1) {
      failures.push(`expected exactly 1 company, found ${companies}`);
    }
    if (companyUsers !== users) {
      failures.push(`expected company_user count (${companyUsers}) to equal app_user count (${users})`);
    }
    if (mismatchedRoles !== 0) {
      failures.push(
        `${mismatchedRoles} company_user row(s) have a role that does not match their app_user.roles bitmask`,
      );
    }
    if (orphans !== 0) {
      failures.push(`${orphans} company_user row(s) reference a non-existent app_user (orphans)`);
    }

    return failures;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.VERIFY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot run the backfill verification.');
    process.exitCode = 1;
    return;
  }

  const failures = await verifyCompanyUserBackfill(connectionString);

  if (failures.length > 0) {
    console.error('Backfill verification FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Backfill verification PASSED: 1 company, company_user count matches app_user, 0 mismatched roles, 0 orphans.',
  );
}

// Only auto-run when invoked directly (`node scripts/verify-company-user-backfill.ts`),
// not when imported by the spec file.
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
