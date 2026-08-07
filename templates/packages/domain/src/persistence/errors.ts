/**
 * The two ways a persistence WRITE can fail for reasons that are about
 * concurrency and time rather than about the business rules.
 *
 * They live in the domain, not in `infra-db`, for the same reason
 * `OrderNotFoundForDeliveryError` does: a repository PORT is a domain
 * contract, so the failures it is allowed to report have to be sayable in the
 * domain's vocabulary. An adapter that let a raw `PrismaClientKnownRequestError`
 * escape would be leaking its technology through the port — and, concretely,
 * both of these surfaced as 500s.
 *
 * WHY THEY EXIST NOW. The delivery-hardening round introduced explicit row
 * locks in `PrismaOrderRepository`, `PrismaCarrierRepository` and
 * `PrismaDeliveryAssignmentRepository`, which made WAITING the designed
 * behavior. Waiting has exactly two bad endings — a cycle, and a budget that
 * runs out — and neither had a translation:
 *
 *   - a deadlock is Postgres `40P01`;
 *   - a blown interactive-transaction budget is Prisma `P2028`, which
 *     `lock-budget.ts`'s own doc comment calls "exactly the outcome the
 *     locking was introduced to prevent";
 *
 * so the mechanism added to stop a class of 500s produced a new class of
 * 500s. `translateTransactionError` (infra-db) maps both, plus the two
 * server-side ceilings (`55P03` lock_timeout, `57014` statement_timeout) that
 * now enforce the budget.
 */

/**
 * The write lost a race it can win by being retried: a deadlock victim, or a
 * lock wait that exceeded `lock_timeout`.
 *
 * A 409-class fact. The request is well-formed and would succeed on its own;
 * another writer was holding what it needed. Distinguished from
 * `PersistenceTimeoutError` because the advice differs — retry this one
 * immediately, investigate that one.
 */
export class ConcurrentWriteConflictError extends Error {
  constructor(
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(
      `"${operation}" conflicted with a concurrent write on the same rows and was rolled back. Retry the request.`,
    );
    this.name = 'ConcurrentWriteConflictError';
  }
}

/**
 * The write did not finish inside its budget: a blown Prisma interactive
 * transaction budget (`P2028`), or a statement the server cancelled
 * (`57014`).
 *
 * A 503-class fact, not 409 and not 500. Nothing about the request is wrong
 * and nothing about the domain refused it — the database was too slow or too
 * contended right now, which is an availability statement, and the honest
 * answer to the client is "try again shortly", not "you did something wrong"
 * and not "we crashed".
 */
export class PersistenceTimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(`"${operation}" exceeded its transaction budget and was rolled back. Retry the request.`);
    this.name = 'PersistenceTimeoutError';
  }
}
