import { Client as PgClient } from 'pg';
import { assertSchemaName } from './schema-name.js';

const SCHEMA_PREFIX = 'store_mgmt_tenant_';

/**
 * One-shot fleet DATA migration for the rows that motivated the whole
 * `DeliveryAssignmentStatus.cancelled` change (CLASS F3).
 *
 * `cancelAssignmentOnOrderCancelTx` closes an assignment when its order is
 * cancelled FROM NOW ON. It does nothing about the rows already stranded in
 * live tenants: an assignment left `in_transit` behind a `cancelled` order,
 * created before that helper existed. Those rows are not cosmetic —
 *
 *   - `computeCarrierCapacity` reads their carrier as BUSY, forever;
 *   - `countOrdersAwaitingCarrier`'s anti-join excludes their order, so it is
 *     invisible to the "needs a carrier" read;
 *   - no API path can close them (`markDelivered` on a cancelled order
 *     throws `InvalidOrderStateError`);
 *   - and since the deactivation guard became real, they now also block
 *     `DELETE /delivery/carriers/:id` for their carrier PERMANENTLY.
 *
 * The last point is why this ships WITH the guard rather than after it: the
 * guard turns a stale reading into a hard block.
 *
 * Same shape and same discipline as `tenant-orphan-sweep.ts`: REPORT-ONLY by
 * default, per-tenant, sequential, and it never touches a row whose order is
 * anything other than `cancelled`. Deliberately NOT a schema migration —
 * `scripts/tenant-migrate.ts` diffs DDL and would never emit an UPDATE.
 */

export interface StrandedAssignmentFinding {
  readonly schemaName: string;
  readonly assignmentId: string;
  readonly orderId: string;
  readonly carrierId: string;
  readonly assignedAt: Date;
}

export interface TenantStrandedAssignmentResult {
  readonly schemaName: string;
  readonly findings: readonly StrandedAssignmentFinding[];
  /** Ids actually closed — always empty unless `allowDestructive` was passed. */
  readonly closed: readonly string[];
  /** Set when this tenant could not be processed; the others still are. */
  readonly error?: string;
}

export interface StrandedAssignmentSweepReport {
  readonly results: readonly TenantStrandedAssignmentResult[];
  /** `true` when any tenant errored — finding stranded rows is this tool working, not failing. */
  readonly failed: boolean;
}

export interface StrandedAssignmentSweepOptions {
  readonly allowDestructive?: boolean;
  /** Overrides auto-discovery — for tests and for scoping a run to a subset of the fleet. */
  readonly tenantSchemas?: readonly string[];
  /** Rows closed per UPDATE statement. Default `DEFAULT_CLOSE_BATCH_SIZE`. */
  readonly batchSize?: number;
  /** Server-side `statement_timeout`/`query_timeout` for each tenant's client, in ms. */
  readonly timeoutMs?: number;
}

/**
 * Rows closed per UPDATE.
 *
 * The closing UPDATE had NO `LIMIT` and no batching, so on a tenant carrying
 * many stranded rows it took exclusive row locks on ALL of them at once and
 * held them until COMMIT — blocking every concurrent
 * `POST /orders/:id/cancel` and `POST /delivery/assignments/:id/deliver`
 * touching any of those assignments, for as long as the whole update took.
 * This is a data-repair tool run against a live fleet; it must not be the
 * thing that takes the fleet down.
 *
 * Each batch is its own statement and its own implicit transaction, so the
 * locks are released between batches. The sweep is idempotent (the predicate
 * is re-stated inside every UPDATE), so a batch that fails halfway leaves the
 * earlier ones committed and a re-run finishes the job.
 */
const DEFAULT_CLOSE_BATCH_SIZE = 500;

/**
 * Server-side budget per statement for each tenant's client.
 *
 * `probeTenantEnumLabels` sets both of these and this did not, so a tenant
 * whose survey or update wedged behind another lock hung the ENTIRE sequential
 * fleet run with no diagnostic at all — every tenant after it simply never ran.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * `${'cancelled'}::text::"DeliveryAssignmentStatus"` for the same reason
 * `cancelAssignmentOnOrderCancelTx` uses it: a tenant that has not run
 * `scripts/tenant-migrate.ts` yet has no such enum value, and a literal cast
 * fails at PLAN time even when no row matches. Here the read is by
 * `status::text`, so an un-migrated tenant can still be SURVEYED; only the
 * closing UPDATE needs the value, and if it is missing that tenant is
 * reported as an error instead of taking the run down.
 */
export async function sweepStrandedAssignments(
  connectionString: string,
  options: StrandedAssignmentSweepOptions = {},
): Promise<StrandedAssignmentSweepReport> {
  const allowDestructive = options.allowDestructive ?? false;
  const tenantSchemas = options.tenantSchemas ?? (await listTenantSchemas(connectionString));

  const results: TenantStrandedAssignmentResult[] = [];
  for (const schemaName of tenantSchemas) {
    results.push(
      await sweepOneTenant({
        connectionString,
        schemaName,
        allowDestructive,
        batchSize: options.batchSize ?? DEFAULT_CLOSE_BATCH_SIZE,
        timeoutMs: options.timeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
      }),
    );
  }

  return { results, failed: results.some((r) => r.error !== undefined) };
}

interface SweepOneTenantParams {
  readonly connectionString: string;
  readonly schemaName: string;
  readonly allowDestructive: boolean;
  readonly batchSize: number;
  readonly timeoutMs: number;
}

/**
 * EVERYTHING that can fail for one tenant is inside the try — the schema-name
 * validation and the connect included.
 *
 * `TenantStrandedAssignmentResult.error` promises "the others still are"
 * [processed], and that promise used to be false for the two most likely
 * real-world failures: `assertSchemaName` and `client.connect()` sat outside
 * this block, so a malformed name out of auto-discovery or an unreachable
 * database threw straight through `sweepStrandedAssignments` and discarded
 * every result already collected. The connect failure leaked the client too,
 * because `finally` was never entered.
 *
 * `client` is declared before the try and closed with `?.` for exactly that
 * reason: the failure can now happen before it is ever constructed.
 */
async function sweepOneTenant(
  params: SweepOneTenantParams,
): Promise<TenantStrandedAssignmentResult> {
  const { connectionString, schemaName, allowDestructive, batchSize, timeoutMs } = params;
  let client: PgClient | undefined;
  // Declared OUTSIDE the try so the `catch` can still report what was already
  // established. The old `catch` returned `findings: []` unconditionally, so a
  // tenant that surveyed successfully and then failed during the UPDATE lost
  // every stranded row it had already found — the operator got an error and no
  // list, when the list is the entire point of the report-only mode.
  const surveyed: StrandedAssignmentFinding[] = [];
  const closedFindings: StrandedAssignmentFinding[] = [];

  try {
    assertSchemaName(schemaName);
    // `statement_timeout`/`query_timeout`, as `probeTenantEnumLabels` sets.
    // Without them a tenant wedged behind another lock hung the whole
    // sequential fleet run and every tenant after it never ran at all.
    client = new PgClient({
      connectionString,
      statement_timeout: timeoutMs,
      query_timeout: timeoutMs,
    });
    await client.connect();
    await client.query(`SET search_path TO "${schemaName}"`);

    const { rows } = await client.query<StrandedRow>(`
      SELECT da."id", da."order_id", da."carrier_id", da."assigned_at"
      FROM "delivery_assignment" da
      JOIN "sales_order" so ON so."id" = da."order_id"
      WHERE da."status"::text = 'in_transit'
        AND so."status"::text = 'cancelled'
      ORDER BY da."assigned_at"
    `);
    surveyed.push(...rows.map((row) => toFinding(schemaName, row)));

    if (!allowDestructive || surveyed.length === 0) {
      return { schemaName, findings: surveyed, closed: [] };
    }

    // BATCHED, and each batch is its own statement (and its own implicit
    // transaction), so the exclusive row locks it takes are released between
    // batches. The unbatched version locked every stranded row in the tenant
    // at once and held them all until COMMIT, blocking concurrent cancels and
    // delivers on all of them — a repair tool that becomes the outage.
    //
    // Each batch re-states the predicate rather than trusting the ids read a
    // moment ago: an order can only move OUT of `cancelled` by never having
    // been there, but re-stating the invariant costs one subquery and removes
    // the read-then-write window entirely. That also makes the loop
    // self-terminating — a row it closes stops matching.
    // `delivered_at` stays NULL: a cancellation is not a delivery.
    //
    // `RETURNING` carries the WHOLE finding shape, not just the id, because
    // this set — not the SELECT above — is the authoritative record of what
    // this run changed. The two can differ: a row that became stranded between
    // the survey and the write is closed here and was never in the survey. The
    // CLI prints `findings`, so that row used to be closed silently.
    for (;;) {
      const { rows: updated } = await client.query<StrandedRow>(
        `
        UPDATE "delivery_assignment" da
        SET "status" = $1::text::"DeliveryAssignmentStatus", "updated_at" = now()
        FROM "sales_order" so
        WHERE so."id" = da."order_id"
          AND da."id" IN (
            SELECT inner_da."id"
            FROM "delivery_assignment" inner_da
            JOIN "sales_order" inner_so ON inner_so."id" = inner_da."order_id"
            WHERE inner_da."status"::text = 'in_transit'
              AND inner_so."status"::text = 'cancelled'
            ORDER BY inner_da."assigned_at"
            LIMIT $2
            FOR UPDATE OF inner_da SKIP LOCKED
          )
        RETURNING da."id", da."order_id", da."carrier_id", da."assigned_at"
        `,
        ['cancelled', batchSize],
      );
      if (updated.length === 0) {
        break;
      }
      closedFindings.push(...updated.map((row) => toFinding(schemaName, row)));
    }

    return {
      schemaName,
      findings: mergeFindings(surveyed, closedFindings),
      closed: closedFindings.map((row) => row.assignmentId),
    };
  } catch (err) {
    // Whatever was established before the failure is still true and still
    // useful. `closed` in particular is authoritative: those batches COMMITTED
    // (each is its own statement), so reporting them as unclosed would be a
    // lie in the direction that makes an operator re-run against rows that are
    // already done.
    return {
      schemaName,
      findings: mergeFindings(surveyed, closedFindings),
      closed: closedFindings.map((row) => row.assignmentId),
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client?.end().catch(() => undefined);
  }
}

interface StrandedRow {
  readonly id: string;
  readonly order_id: string;
  readonly carrier_id: string;
  readonly assigned_at: Date;
}

function toFinding(schemaName: string, row: StrandedRow): StrandedAssignmentFinding {
  return {
    schemaName,
    assignmentId: row.id,
    orderId: row.order_id,
    carrierId: row.carrier_id,
    assignedAt: row.assigned_at,
  };
}

/**
 * Union of what was surveyed and what was closed, KEEPING THE SURVEY'S ORDER.
 *
 * The previous shape was `[...closedFindings, ...surveyedOnly]`, which threw
 * away the `ORDER BY assigned_at` the survey query goes out of its way to
 * apply — the CLI printed the oldest-first list in whatever order the UPDATE's
 * `RETURNING` happened to produce. Sorting the merged set by `assignedAt`
 * restores the ordering for the rows that came from the survey AND puts the
 * rows discovered only by the UPDATE in the same sequence, which is the order
 * an operator reading a repair report actually wants.
 */
function mergeFindings(
  surveyed: readonly StrandedAssignmentFinding[],
  closed: readonly StrandedAssignmentFinding[],
): StrandedAssignmentFinding[] {
  const byId = new Map<string, StrandedAssignmentFinding>();
  for (const finding of [...surveyed, ...closed]) {
    byId.set(finding.assignmentId, finding);
  }
  return [...byId.values()].sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime());
}

async function listTenantSchemas(connectionString: string): Promise<string[]> {
  const client = new PgClient({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ schema_name: string }>(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE $1 ORDER BY schema_name',
      [`${SCHEMA_PREFIX}%`],
    );
    return rows.map((r) => r.schema_name);
  } finally {
    await client.end();
  }
}
