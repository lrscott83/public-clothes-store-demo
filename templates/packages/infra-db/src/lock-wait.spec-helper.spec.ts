import { randomUUID } from 'node:crypto';
import { LOCK_TRANSACTION_BUDGET } from './lock-budget.js';
import { backendPid, backendsBlockedBy, rowIsLocked, waitUntil } from './lock-wait.spec-helper.js';
import { fakeTenantContext, useTenantSchema } from './tenant-schema.spec-helper.js';

/**
 * The helpers the concurrency specs trust. Precedent:
 * `tenant-schema.spec-helper.spec.ts` — a helper that every other spec's
 * verdict depends on is worth proving, because a helper that answers "yes"
 * for the wrong reason makes every caller pass for free.
 *
 * TWO defects are covered here, both of which made a caller pass without the
 * thing it claimed having happened:
 *
 *   1. `backendsBlockedOnLock` counted `wait_event_type = 'Lock'` across
 *      `current_database()` and justified that with this package's
 *      `maxWorkers: 1`. That pins concurrency only WITHIN `packages/infra-db`,
 *      while `store_mgmt_test` is the same database every other package and
 *      app suite uses and turbo parallelizes same-level `test` tasks. Any
 *      concurrently-running suite blocked on any lock satisfied the
 *      predicate — the exact false pass the helper replaced fixed sleeps to
 *      remove.
 *   2. `rowIsLocked` returned `false` for a NONEXISTENT row, so a wrong id was
 *      indistinguishable from "nobody has it locked".
 */
describe('lock-wait spec helpers', () => {
  const getTenantSchema = useTenantSchema();

  function client() {
    return fakeTenantContext(getTenantSchema).getClient();
  }

  async function seedCarrier(): Promise<string> {
    const carrier = await client().carrier.create({ data: { name: `Carrier ${randomUUID()}` } });
    return carrier.id;
  }

  describe('rowIsLocked', () => {
    it('is false for a row nobody has locked', async () => {
      const carrierId = await seedCarrier();

      expect(await rowIsLocked(client(), 'carrier', carrierId)).toBe(false);
    });

    /**
     * `FOR UPDATE NOWAIT` over ZERO rows raises nothing, so the old version
     * answered `false`. Every caller polls this waiting for `true`, so a
     * typo'd id simply timed out with a message about contention that never
     * had anything to lock.
     */
    it('THROWS for a nonexistent row rather than reporting "not locked"', async () => {
      await expect(rowIsLocked(client(), 'carrier', randomUUID())).rejects.toThrow(/no row with id/);
    });
  });

  describe('backendsBlockedBy', () => {
    /**
     * THE property the database-wide count did not have. One transaction holds
     * a row lock, a second blocks on it, and a THIRD pid — one that is holding
     * nothing — must attribute zero waiters to itself even though the database
     * plainly has a blocked backend right now.
     *
     * Under the old helper both numbers were the same number, which is why an
     * unrelated suite's contention could stand in for the caller's own.
     */
    it('counts waiters blocked BY a given holder, and nobody else’s', async () => {
      const carrierId = await seedCarrier();
      const prisma = client();

      let openTheGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openTheGate = resolve;
      });
      let holderPid!: number;
      let holderPidReady!: () => void;
      const holderPidKnown = new Promise<void>((resolve) => {
        holderPidReady = resolve;
      });

      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "carrier" WHERE "id" = ${carrierId}::uuid FOR UPDATE`;
        holderPid = await backendPid(tx);
        holderPidReady();
        await gate;
      }, LOCK_TRANSACTION_BUDGET);

      await holderPidKnown;

      // A second transaction that will genuinely queue behind the holder.
      const waiter = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "carrier" WHERE "id" = ${carrierId}::uuid FOR UPDATE`;
      }, LOCK_TRANSACTION_BUDGET);

      try {
        expect(await waitUntil(() => backendsBlockedBy(prisma, holderPid).then((n) => n > 0))).toBe(
          true,
        );

        // THE discrimination: the very same blocked backend attributes NOTHING
        // to a pid that holds nothing. A pid that cannot exist is used so the
        // assertion cannot accidentally name a real holder.
        expect(await backendsBlockedBy(prisma, -1)).toBe(0);
      } finally {
        openTheGate();
        await holder;
        await waiter;
      }
    }, 40_000);
  });
});
