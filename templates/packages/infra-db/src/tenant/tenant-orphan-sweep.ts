import { Client as PgClient } from 'pg';
import { assertSchemaName, schemaNameFor } from './schema-name.js';

const SCHEMA_PREFIX = 'store_mgmt_tenant_';
/**
 * How long a Membership may sit without a matching tenant `CompanyUser`
 * before the sweep treats it as a genuine orphan instead of a saga step 4/5
 * race (design D7: `create-company.saga.ts` writes the master `Membership`
 * one step BEFORE the tenant `CompanyUser`, so a brief gap between the two is
 * an expected, healthy in-flight state, not a defect). Overridable via
 * `TENANT_ORPHAN_SWEEP_GRACE_MINUTES` — see the CLI wrapper.
 */
const DEFAULT_GRACE_MINUTES = 15;

export interface OrphanSchemaFinding {
  /** A `store_mgmt_tenant_%` schema with NO `Company` row (in any state) that derives this name via `schemaNameFor`. */
  readonly schemaName: string;
}

export interface DanglingCompanySchemaFinding {
  /** A `Company` row whose `schemaName` is set, but no matching schema exists in Postgres. */
  readonly companyId: string;
  readonly schemaName: string;
}

export interface OrphanMembershipFinding {
  /** An ACTIVE `Membership` older than the grace window with no matching tenant `CompanyUser` row. */
  readonly membershipId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly schemaName: string | null;
  readonly createdAt: Date;
}

export interface InFlightMembershipFinding extends OrphanMembershipFinding {
  /** How old the Membership is, in minutes — always < the grace window, which is why this is NOT in `orphanMemberships`. */
  readonly ageMinutes: number;
}

export interface UnresolvedIncidentFinding {
  readonly id: string;
  readonly companyId: string;
  readonly step: string;
  readonly reason: string;
  readonly createdAt: Date;
}

export interface TenantOrphanSweepReport {
  readonly orphanSchemas: readonly OrphanSchemaFinding[];
  readonly danglingCompanySchemas: readonly DanglingCompanySchemaFinding[];
  readonly orphanMemberships: readonly OrphanMembershipFinding[];
  /**
   * Reported, NEVER reconciled — these look like class-3 orphans but are
   * still inside the grace window, so they may just be a saga between its
   * step 4 and step 5. "Cannot tell whether this is an orphan or a race" ->
   * report it, don't touch it.
   */
  readonly inFlightMemberships: readonly InFlightMembershipFinding[];
  /** Informational cross-reference (design D7: "the sweep tool reads this for a human operator, not for branching logic") — NOT used to gate any decision above. */
  readonly unresolvedIncidents: readonly UnresolvedIncidentFinding[];
  readonly reconciled: {
    readonly schemasDropped: readonly string[];
    readonly companySchemaNamesCleared: readonly string[];
    readonly membershipsDeleted: readonly string[];
  };
}

export interface TenantOrphanSweepOptions {
  /**
   * Opt-in, mirrors D6's `--allow-destructive` discipline for
   * `tenant-migrate.ts`. Defaults to `false`: every finding above is always
   * REPORTED; nothing is ever changed unless this is explicitly `true`.
   */
  readonly allowDestructive?: boolean;
  readonly graceMinutes?: number;
}

interface CompanyRow {
  readonly id: string;
  readonly schema_name: string | null;
}

/**
 * Reconciles the three orphan classes design D7 names (task 10.3): a failing
 * compensation step in `create-company.saga.ts` is NOT trusted — it writes a
 * `ProvisioningIncident` and this sweep is what actually reconciles the mess
 * left behind, unlike poolops which only logs (landmine 5).
 *
 * Defaults to REPORTING ONLY. Destructive reconciliation (dropping a schema,
 * clearing a dangling `Company.schemaName`, deleting an orphan `Membership`)
 * only happens when `options.allowDestructive` is explicitly `true` — same
 * discipline design D6 applies to `tenant-migrate.ts`'s `--allow-destructive`
 * flag. Never drops a schema with a live `Company` row pointing at it (class
 * 1's very definition excludes it) and never touches `public` (every query
 * here is scoped to the `store_mgmt_tenant_%` prefix).
 */
export async function sweepTenantOrphans(
  connectionString: string,
  options: TenantOrphanSweepOptions = {},
): Promise<TenantOrphanSweepReport> {
  const allowDestructive = options.allowDestructive ?? false;
  const graceMinutes = options.graceMinutes ?? DEFAULT_GRACE_MINUTES;

  const client = new PgClient({ connectionString });
  await client.connect();
  try {
    const allTenantSchemas = await listTenantSchemas(client);
    const companies = await listCompanies(client);

    const orphanSchemas = findOrphanSchemas(allTenantSchemas, companies);
    const danglingCompanySchemas = findDanglingCompanySchemas(allTenantSchemas, companies);
    const { orphanMemberships, inFlightMemberships } = await findMembershipFindings(
      client,
      connectionString,
      companies,
      graceMinutes,
    );
    const unresolvedIncidents = await listUnresolvedIncidents(client);

    const reconciled = {
      schemasDropped: [] as string[],
      companySchemaNamesCleared: [] as string[],
      membershipsDeleted: [] as string[],
    };

    if (allowDestructive) {
      for (const { schemaName } of orphanSchemas) {
        // Defense in depth: even though every candidate already came from a
        // `store_mgmt_tenant_%`-filtered query, never let an unvalidated
        // string reach a DDL statement (design D3).
        assertSchemaName(schemaName);
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        reconciled.schemasDropped.push(schemaName);
      }
      for (const { companyId } of danglingCompanySchemas) {
        await client.query('UPDATE "company" SET schema_name = NULL WHERE id = $1', [companyId]);
        reconciled.companySchemaNamesCleared.push(companyId);
      }
      for (const { membershipId } of orphanMemberships) {
        await client.query('DELETE FROM "membership" WHERE id = $1', [membershipId]);
        reconciled.membershipsDeleted.push(membershipId);
      }
    }

    return {
      orphanSchemas,
      danglingCompanySchemas,
      orphanMemberships,
      inFlightMemberships,
      unresolvedIncidents,
      reconciled,
    };
  } finally {
    await client.end();
  }
}

async function listTenantSchemas(client: PgClient): Promise<string[]> {
  const { rows } = await client.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE $1 ORDER BY schema_name`,
    [`${SCHEMA_PREFIX}%`],
  );
  return rows.map((r) => r.schema_name);
}

async function listCompanies(client: PgClient): Promise<CompanyRow[]> {
  const { rows } = await client.query<CompanyRow>('SELECT id, schema_name FROM "company"');
  return rows;
}

/**
 * Class 1: a `store_mgmt_tenant_%` schema with NO `Company` row that derives
 * this exact name via `schemaNameFor`. Deliberately compares by DERIVATION,
 * not by `Company.schemaName IS NOT NULL` — a `Company` mid-saga between
 * step 2 (CREATE SCHEMA) and step 3 (`schemaName` set) still owns its schema
 * even though the column is still NULL, so this comparison has NO race
 * window at all (unlike class 3 below): as long as the `Company` row exists
 * in ANY state, its schema is claimed.
 */
function findOrphanSchemas(allTenantSchemas: string[], companies: CompanyRow[]): OrphanSchemaFinding[] {
  const claimed = new Set(companies.map((c) => schemaNameFor(c.id)));
  return allTenantSchemas.filter((schemaName) => !claimed.has(schemaName)).map((schemaName) => ({ schemaName }));
}

/**
 * Class 2: `Company.schemaName` is set (step 3 already committed — this is
 * not a race, a NULL column would never reach this check) but no schema by
 * that name exists.
 */
function findDanglingCompanySchemas(
  allTenantSchemas: string[],
  companies: CompanyRow[],
): DanglingCompanySchemaFinding[] {
  const existing = new Set(allTenantSchemas);
  return companies
    .filter((c): c is CompanyRow & { schema_name: string } => c.schema_name !== null && !existing.has(c.schema_name))
    .map((c) => ({ companyId: c.id, schemaName: c.schema_name }));
}

/**
 * Class 3: an ACTIVE `Membership` with no matching tenant `CompanyUser`.
 * Genuinely racy (design D7 steps 4/5 are sequential, not atomic) — split
 * into `orphanMemberships` (older than `graceMinutes`, safe to report/
 * reconcile) and `inFlightMemberships` (younger, reported only).
 */
async function findMembershipFindings(
  client: PgClient,
  connectionString: string,
  companies: CompanyRow[],
  graceMinutes: number,
): Promise<{ orphanMemberships: OrphanMembershipFinding[]; inFlightMemberships: InFlightMembershipFinding[] }> {
  const { rows: memberships } = await client.query<{
    id: string;
    user_id: string;
    company_id: string;
    created_at: Date;
  }>('SELECT id, user_id, company_id, created_at FROM "membership" WHERE status = \'ACTIVE\'');

  const schemaByCompanyId = new Map(companies.map((c) => [c.id, c.schema_name]));
  const orphanMemberships: OrphanMembershipFinding[] = [];
  const inFlightMemberships: InFlightMembershipFinding[] = [];
  const now = Date.now();

  for (const m of memberships) {
    const schemaName = schemaByCompanyId.get(m.company_id) ?? null;
    const hasTenantCompanyUser = schemaName
      ? await tenantCompanyUserExists(connectionString, schemaName, m.user_id)
      : false;
    if (hasTenantCompanyUser) continue;

    const createdAt = new Date(m.created_at);
    const ageMinutes = (now - createdAt.getTime()) / 60_000;
    const finding: OrphanMembershipFinding = {
      membershipId: m.id,
      userId: m.user_id,
      companyId: m.company_id,
      schemaName,
      createdAt,
    };
    if (ageMinutes < graceMinutes) {
      inFlightMemberships.push({ ...finding, ageMinutes });
    } else {
      orphanMemberships.push(finding);
    }
  }

  return { orphanMemberships, inFlightMemberships };
}

/**
 * Opens its OWN short-lived connection scoped (via `search_path`) to
 * `schemaName` — mirrors `TenantDatabaseService.createSchema`'s raw-`pg`
 * discipline rather than pulling in the bounded `TenantPrismaFactory` pool
 * (design D2) for a one-shot script that never runs concurrently with
 * itself. A relation-does-not-exist error (the schema itself is one of
 * `danglingCompanySchemas` — set on the `Company` row but actually missing)
 * is treated as "no CompanyUser", not re-thrown: that dangling-schema case
 * is already surfaced as its own finding, and letting it also abort the
 * whole sweep would turn one bad row into zero results for everyone else.
 */
async function tenantCompanyUserExists(
  connectionString: string,
  schemaName: string,
  userId: string,
): Promise<boolean> {
  assertSchemaName(schemaName);

  const client = new PgClient({ connectionString });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schemaName}"`);
    const { rows } = await client.query('SELECT 1 FROM "company_user" WHERE id = $1', [userId]);
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

async function listUnresolvedIncidents(client: PgClient): Promise<UnresolvedIncidentFinding[]> {
  const { rows } = await client.query<{
    id: string;
    company_id: string;
    step: string;
    reason: string;
    created_at: Date;
  }>('SELECT id, company_id, step, reason, created_at FROM "provisioning_incident" WHERE resolved_at IS NULL ORDER BY created_at ASC');

  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    step: r.step,
    reason: r.reason,
    createdAt: new Date(r.created_at),
  }));
}
