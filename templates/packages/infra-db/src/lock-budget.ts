/**
 * The explicit time budget for every `$transaction` in this package that can
 * WAIT on a row lock — and, just as importantly, the SERVER-SIDE ceilings that
 * are what actually enforce it.
 *
 * Prisma's defaults are `maxWait: 2_000` / `timeout: 5_000`, and they used to
 * apply to all of these by omission. That was survivable only while none of
 * these transactions ever blocked: they took their row locks implicitly, at
 * the last statement, and released them at COMMIT a moment later. The
 * delivery-hardening round changed that deliberately — `PrismaOrderRepository`
 * now takes an order lock as its FIRST statement, `PrismaCarrierRepository`
 * and `PrismaDeliveryAssignmentRepository` take carrier/order locks up front —
 * so waiting is now the DESIGNED behavior, and a waiter queued behind a
 * multi-line stock loop can easily need more than five seconds.
 *
 * WHAT EACH LAYER REALLY GUARANTEES. The previous version of this comment
 * claimed `timeout` "bounds the transaction itself, lock waits included …
 * short enough that a genuinely stuck holder surfaces as an error instead of
 * hanging the request forever". That is not what it does, and the difference
 * is the whole failure mode:
 *
 *   - `timeout` (client-side, Prisma) is evaluated when a query is DISPATCHED
 *     on the interactive transaction. It does NOT cancel a statement that is
 *     already in flight server-side. A transaction blocked behind an `idle in
 *     transaction` holder is inside a single in-flight statement, so this
 *     number never fires — it waits INDEFINITELY, holding a pool connection,
 *     which is the exact failure the 20s was claimed to bound.
 *   - `lock_timeout` (server-side) is what actually bounds a LOCK WAIT.
 *     Postgres aborts the statement with `55P03` once it has waited this long
 *     for a lock. This is the ceiling that makes a stuck holder surface as an
 *     error.
 *   - `statement_timeout` (server-side) bounds any statement, lock waits and
 *     runaway plans alike, with `57014`. It is the backstop for the case
 *     `lock_timeout` does not cover: a statement that is genuinely executing
 *     rather than waiting.
 *   - `maxWait` (client-side, Prisma) bounds only the wait for a POOL
 *     CONNECTION before the transaction starts. It is a saturation signal,
 *     not a lock signal.
 *
 * Both server-side ceilings are set on the tenant pool's connect `options`
 * (`tenant-prisma-factory.ts`) so they apply to EVERY statement on a tenant
 * connection, raw SQL included — not only to statements issued through a
 * Prisma model call. They are sized strictly UNDER the transaction budget so
 * a blown lock wait surfaces as a translated `55P03`/`57014` (see
 * `translateTransactionError`) rather than as the untranslated P2028 that a
 * client-side expiry produces.
 *
 * The module's own concurrency specs pass this SAME constant. They previously
 * hard-coded `{ timeout: 20_000, maxWait: 20_000 }` to work at all, while the
 * production code they exercise ran on Prisma's much smaller defaults — the
 * tests were passing on a budget production did not have.
 */
export const LOCK_TRANSACTION_BUDGET = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

/**
 * Server-side `lock_timeout` for every tenant connection, in ms.
 *
 * Under `LOCK_TRANSACTION_BUDGET.timeout` on purpose: a lock wait that blows
 * this budget must be reported as a lock conflict (`55P03`, translated to a
 * 409-class domain error), not as Prisma's generic P2028, and certainly not
 * as an unbounded hang. The gap between the two is deliberate headroom for
 * the rest of the transaction's own work.
 */
export const TENANT_LOCK_TIMEOUT_MS = 15_000;

/**
 * Server-side `statement_timeout` for every tenant connection, in ms.
 *
 * The backstop for a statement that is executing rather than waiting. Above
 * `TENANT_LOCK_TIMEOUT_MS` so a genuine lock conflict is reported as a lock
 * conflict, and below `LOCK_TRANSACTION_BUDGET.timeout` so the server is
 * always the one that gives up first — the only party that can actually
 * cancel the work.
 */
export const TENANT_STATEMENT_TIMEOUT_MS = 18_000;

/**
 * Server-side `idle_in_transaction_session_timeout` for every tenant
 * connection, in ms.
 *
 * The other two ceilings bound a STATEMENT. Neither bounds a transaction that
 * is open with no statement running — an `idle in transaction` connection,
 * which is precisely the holder shape that made the lock waits pathological in
 * the first place. Without this, a transaction whose client stalled between
 * statements holds its row locks and its pool connection indefinitely, and
 * `statement_timeout` never fires because nothing is executing.
 *
 * ABOVE `LOCK_TRANSACTION_BUDGET.timeout`, deliberately: it must only ever
 * reap a transaction that is genuinely abandoned, never pre-empt one that is
 * still doing legitimate work inside its budget. The order of the four numbers
 * — 15s lock wait, 18s statement, 20s transaction, 30s idle — is the contract.
 */
export const TENANT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;
