import type { Prisma } from '../generated/tenant/client.js';

/**
 * Lock-observation helpers shared by every concurrency spec in this package.
 *
 * These specs used to coordinate with a bare `await setTimeout(300)` and a
 * comment asserting the other transaction had "reached — and blocked on" the
 * lock by then. Nothing verified that. On a loaded CI runner the sleep can
 * expire before the other transaction has even issued its statement, in which
 * case the test passes for the WRONG reason (no contention ever happened);
 * on a slower one it flakes. A test about blocking that never checks whether
 * anything blocked is not evidence of anything.
 *
 * Both helpers observe the real state instead of guessing at it, so the specs
 * either see genuine contention or fail with a clear message.
 */

/** Something that can run a raw query — the tenant client or an open `tx`. */
type RawQueryable = Pick<Prisma.TransactionClient, '$queryRawUnsafe'>;

/**
 * `waitUntil`'s default budget must stay UNDER the server-side `lock_timeout`
 * every tenant connection now carries (`TENANT_LOCK_TIMEOUT_MS`), or a helper
 * that polls for contention could outlive the blocked statement it is polling
 * for and report "never blocked" about a transaction Postgres already aborted.
 */

const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 25;

/**
 * `true` as soon as `predicate` holds, `false` if it never does within
 * `timeoutMs`. Never throws on timeout: the CALLER's assertion is what should
 * report the failure, in its own words.
 */
export async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * `true` when SOME other backend holds a row lock on `table` for `id`.
 *
 * Probes with `FOR UPDATE NOWAIT` from a throwaway transaction, which fails
 * immediately with Postgres `55P03` (`lock_not_available`) rather than
 * queueing. Any OTHER failure is re-thrown: a probe that reported "locked"
 * for a typo'd column would make every caller pass for free.
 *
 * A NONEXISTENT ROW IS AN ERROR, NOT "NOT LOCKED". `FOR UPDATE` over zero
 * rows raises nothing, so a wrong id used to be indistinguishable from a row
 * nobody has locked — and every caller polls this waiting for `true`, so a
 * typo'd id would simply time out with a message about contention that never
 * had anything to lock. Asserting the row came back turns that into an
 * immediate, accurate failure.
 */
export async function rowIsLocked(
  client: { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> },
  table: string,
  id: string,
): Promise<boolean> {
  try {
    const rows = await client.$transaction(async (tx: RawQueryable) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "${table}" WHERE "id" = $1::uuid FOR UPDATE NOWAIT`,
        id,
      ),
    );
    if (rows.length !== 1) {
      throw new Error(
        `rowIsLocked: "${table}" has no row with id ${id} — "not locked" would be a false negative.`,
      );
    }
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/55P03|could not obtain lock|lock_not_available/i.test(message)) {
      return true;
    }
    throw err;
  }
}

/**
 * The backend pid of the connection `tx` is running on.
 *
 * Callers capture this INSIDE the transaction that holds the lock, so
 * `backendsBlockedBy` can attribute a wait to that exact holder.
 */
export async function backendPid(tx: RawQueryable): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ pid: number }[]>('SELECT pg_backend_pid()::int AS pid');
  const pid = rows[0]?.pid;
  if (typeof pid !== 'number') {
    throw new Error('backendPid: pg_backend_pid() returned nothing');
  }
  return pid;
}

/**
 * How many backends are blocked RIGHT NOW **by `holderPid` specifically**.
 *
 * This replaces a count of `pg_stat_activity.wait_event_type = 'Lock'` across
 * `current_database()`, which was justified by this package pinning
 * `maxWorkers: 1`. That setting pins concurrency only WITHIN
 * `packages/infra-db`, while `store_mgmt_test` is the same database every
 * other package and app suite uses and turbo parallelizes same-level `test`
 * tasks. So any concurrently-running suite blocking on any lock satisfied the
 * predicate, and the assertion passed without the transaction under test
 * having contended at all — the exact false pass the helper was written to
 * remove, one layer up.
 *
 * `pg_blocking_pids(pid)` returns the backends that a given blocked backend is
 * waiting on, so requiring `holderPid` to appear in it ties the wait to the
 * lock this test actually took. It needs no assumption about what else is
 * running.
 */
export async function backendsBlockedBy(
  client: { $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T> },
  holderPid: number,
): Promise<number> {
  const rows = await client.$queryRawUnsafe<{ count: bigint | number }[]>(
    `SELECT COUNT(*)::int AS count FROM pg_stat_activity a
     WHERE a.datname = current_database()
       AND a.wait_event_type = 'Lock'
       AND $1::int = ANY(pg_blocking_pids(a.pid))`,
    holderPid,
  );
  return Number(rows[0]?.count ?? 0);
}
