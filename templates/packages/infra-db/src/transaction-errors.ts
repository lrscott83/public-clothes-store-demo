import { ConcurrentWriteConflictError, PersistenceTimeoutError } from '@store-mgmt/domain';
import { Prisma } from '../generated/tenant/client.js';

/**
 * Translates the failures that EXPLICIT LOCKING made reachable into the two
 * domain errors a port is allowed to report.
 *
 * The locking introduced by the delivery-hardening round made waiting the
 * designed behavior of every status transition and every assignment write.
 * Waiting has exactly two bad endings, and neither had a translation
 * anywhere:
 *
 *   - Prisma `P2028` — the interactive-transaction budget ran out.
 *     `lock-budget.ts` names this "exactly the outcome the locking was
 *     introduced to prevent", and it surfaced as a 500.
 *   - Postgres `40P01` — deadlock detected. `TRANSITION_LINES_INCLUDE`'s own
 *     doc comment describes producing one as the thing its lock ordering
 *     exists to avoid, and it too surfaced as a 500.
 *
 * Plus the two SERVER-SIDE ceilings that now enforce the budget from the
 * tenant pool (`tenant-prisma-factory.ts`), which did not exist before and so
 * had no translation either:
 *
 *   - `55P03` — `lock_timeout` fired while waiting for a row lock.
 *   - `57014` — `statement_timeout` cancelled the statement.
 *
 * WHERE IT IS APPLIED: every `$transaction` in this package that passes
 * `LOCK_TRANSACTION_BUDGET`. `PrismaDeliveryAssignmentRepository.create` had
 * a translator that handled only constraint violations and returned
 * everything else unchanged; `PrismaOrderRepository`'s three transitions had
 * no translator at all. Both are covered now, along with the two inventory
 * repositories and `PrismaCarrierRepository`, which take the same locks under
 * the same budget.
 *
 * ANYTHING UNRECOGNISED IS RETURNED UNCHANGED. This is a translator, not a
 * catch-all: a genuine bug must still reach the caller as itself.
 */

/** `lock_not_available` — `lock_timeout` fired while waiting for a row lock. */
const PG_LOCK_NOT_AVAILABLE = '55P03';
/** `deadlock_detected` — Postgres picked this transaction as the victim of a cycle. */
const PG_DEADLOCK_DETECTED = '40P01';
/** `query_canceled` — `statement_timeout` fired. */
const PG_QUERY_CANCELED = '57014';

/**
 * The SQLSTATE, wherever the driver stashed it.
 *
 * A raw `pg` error carries it on `code`. Prisma wraps a driver error as
 * `P2010`/`P2034`-ish shapes whose `meta.code` (or `meta.driverAdapterError`)
 * carries the original, and the pg adapter re-throws some of them verbatim.
 * Reading all three is what stops a driver-version change silently turning
 * these branches into dead code.
 */
function sqlStateOf(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  // A `PrismaClientKnownRequestError`'s OWN `code` is always a Prisma code
  // (`P2028`, `P2010`, …), never a SQLSTATE — and the two are
  // indistinguishable by shape, since both are five alphanumeric characters.
  // Reading it as a SQLSTATE would shadow the real one nested in `meta`, which
  // is exactly where a wrapped driver error puts it.
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    const direct = (err as { code?: unknown }).code;
    if (typeof direct === 'string' && /^[0-9A-Z]{5}$/.test(direct)) {
      return direct;
    }
  }
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta === 'object' && meta !== null) {
    const metaCode = (meta as { code?: unknown }).code;
    if (typeof metaCode === 'string') {
      return metaCode;
    }
    const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
    if (typeof adapterError === 'object' && adapterError !== null) {
      const cause = (adapterError as { cause?: { code?: unknown } }).cause;
      if (typeof cause?.code === 'string') {
        return cause.code;
      }
    }
  }
  return undefined;
}

/**
 * `operation` names the call site (`'PrismaOrderRepository.deliver'`), because
 * these two errors say nothing about WHAT was being written and an operator
 * reading the log needs to know.
 */
export function translateTransactionError(err: unknown, operation: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028') {
    return new PersistenceTimeoutError(operation, err);
  }

  const sqlState = sqlStateOf(err);
  if (sqlState === PG_DEADLOCK_DETECTED || sqlState === PG_LOCK_NOT_AVAILABLE) {
    return new ConcurrentWriteConflictError(operation, err);
  }
  if (sqlState === PG_QUERY_CANCELED) {
    return new PersistenceTimeoutError(operation, err);
  }

  // Prisma does not always surface a SQLSTATE for a driver-level cancellation:
  // it can arrive as a `PrismaClientUnknownRequestError` whose message is the
  // driver's. Matching the message is a LAST resort and is deliberately
  // narrow — these three strings are Postgres's own wording, not ours.
  const message = err instanceof Error ? err.message : '';
  if (/deadlock detected/i.test(message)) {
    return new ConcurrentWriteConflictError(operation, err);
  }
  if (/canceling statement due to (statement timeout|lock timeout)/i.test(message)) {
    return /lock timeout/i.test(message)
      ? new ConcurrentWriteConflictError(operation, err)
      : new PersistenceTimeoutError(operation, err);
  }

  return err;
}

/**
 * Runs `fn` and rethrows whatever `translateTransactionError` makes of a
 * failure. The one call shape every locked transaction in this package uses,
 * so no adapter has to remember to wire the translator itself — the recurring
 * defect here has been fixing the named adapter and leaving its siblings.
 */
export async function withTransactionErrorMapping<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw translateTransactionError(err, operation);
  }
}
