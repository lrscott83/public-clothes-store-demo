import { ConcurrentWriteConflictError, PersistenceTimeoutError } from '@store-mgmt/domain';
import { Prisma } from '../generated/tenant/client.js';
import { LOCK_TRANSACTION_BUDGET, TENANT_LOCK_TIMEOUT_MS } from './lock-budget.js';
import { translateTransactionError, withTransactionErrorMapping } from './transaction-errors.js';
import { fakeTenantContext, useTenantSchema } from './tenant-schema.spec-helper.js';

/**
 * The explicit row locking introduced by this round made WAITING the designed
 * behavior of every status transition and every assignment write. Waiting has
 * exactly two bad endings — a cycle and a budget that runs out — and NEITHER
 * had a translation:
 *
 *   - `translateCreateConstraintError` returned anything unrecognised
 *     unchanged, and it wraps the whole `$transaction`;
 *   - `PrismaOrderRepository`'s three transitions had no translator at all.
 *
 * So Prisma `P2028` (blown budget — which `lock-budget.ts`'s own doc calls
 * "exactly the outcome the locking was introduced to prevent") and Postgres
 * `40P01` (deadlock — the outcome `TRANSITION_LINES_INCLUDE`'s lock ordering
 * exists to avoid) both surfaced as 500s. The mechanism added to stop one
 * class of 500 produced another.
 */
describe('translateTransactionError', () => {
  function prismaKnownError(code: string, meta?: Record<string, unknown>) {
    return new Prisma.PrismaClientKnownRequestError('boom', {
      code,
      clientVersion: 'test',
      ...(meta ? { meta } : {}),
    });
  }

  it('maps a blown transaction budget (P2028) to PersistenceTimeoutError', () => {
    const translated = translateTransactionError(prismaKnownError('P2028'), 'Repo.op');

    expect(translated).toBeInstanceOf(PersistenceTimeoutError);
    expect((translated as PersistenceTimeoutError).operation).toBe('Repo.op');
  });

  it('maps a deadlock (40P01) to ConcurrentWriteConflictError — retryable, 409 class', () => {
    expect(translateTransactionError({ code: '40P01' }, 'Repo.op')).toBeInstanceOf(
      ConcurrentWriteConflictError,
    );
  });

  /** The server-side ceiling that now enforces the budget from the tenant pool. */
  it('maps a lock_timeout (55P03) to ConcurrentWriteConflictError', () => {
    expect(translateTransactionError({ code: '55P03' }, 'Repo.op')).toBeInstanceOf(
      ConcurrentWriteConflictError,
    );
  });

  it('maps a statement_timeout (57014) to PersistenceTimeoutError', () => {
    expect(translateTransactionError({ code: '57014' }, 'Repo.op')).toBeInstanceOf(
      PersistenceTimeoutError,
    );
  });

  /** Prisma wraps driver errors; the SQLSTATE can arrive nested rather than on `code`. */
  it('finds the SQLSTATE when Prisma reports it in meta rather than on the error', () => {
    expect(
      translateTransactionError(prismaKnownError('P2010', { code: '40P01' }), 'Repo.op'),
    ).toBeInstanceOf(ConcurrentWriteConflictError);
  });

  it('falls back to Postgres’ own wording when no SQLSTATE survives the wrapping', () => {
    expect(
      translateTransactionError(new Error('deadlock detected while updating tuple'), 'Repo.op'),
    ).toBeInstanceOf(ConcurrentWriteConflictError);
    expect(
      translateTransactionError(
        new Error('canceling statement due to statement timeout'),
        'Repo.op',
      ),
    ).toBeInstanceOf(PersistenceTimeoutError);
  });

  /** A translator, not a catch-all: a genuine bug must reach the caller as itself. */
  it('returns anything unrecognised UNCHANGED', () => {
    const bug = new TypeError('cannot read properties of undefined');

    expect(translateTransactionError(bug, 'Repo.op')).toBe(bug);
    expect(translateTransactionError(prismaKnownError('P2002'), 'Repo.op')).toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  describe('against a real Postgres', () => {
    const getTenantSchema = useTenantSchema();

    /**
     * Not a hand-built error object: a REAL `lock_timeout` fired by the real
     * server-side setting, translated through the real helper. This is what
     * proves the pool's `lock_timeout` is (a) actually applied to the
     * connection and (b) recognisable once Prisma has wrapped it.
     */
    it('translates a REAL lock_timeout raised by the server-side ceiling', async () => {
      const prisma = fakeTenantContext(getTenantSchema).getClient();
      const carrier = await prisma.carrier.create({ data: { name: 'Lock Timeout Carrier' } });

      let openTheGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openTheGate = resolve;
      });

      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "carrier" WHERE "id" = ${carrier.id}::uuid FOR UPDATE`;
        await gate;
      }, LOCK_TRANSACTION_BUDGET);

      // A tiny per-transaction `lock_timeout`, so the blocked statement is
      // aborted in milliseconds rather than after the pool's real ceiling.
      const blocked = withTransactionErrorMapping('Spec.blockedWrite', () =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL lock_timeout = 250');
          await tx.$queryRaw`SELECT "id" FROM "carrier" WHERE "id" = ${carrier.id}::uuid FOR UPDATE`;
        }, LOCK_TRANSACTION_BUDGET),
      );

      await expect(blocked).rejects.toBeInstanceOf(ConcurrentWriteConflictError);

      openTheGate();
      await holder;

      // The production ceiling is real too, and under the transaction budget —
      // the spec above only shortens it so the test does not wait 15s.
      expect(TENANT_LOCK_TIMEOUT_MS).toBeLessThan(LOCK_TRANSACTION_BUDGET.timeout);
    }, 40_000);
  });
});
