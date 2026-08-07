import { randomUUID } from 'node:crypto';
import {
  CarrierHasOpenAssignmentsError,
  CarrierNotFoundError,
  OrderNotAssignableStateError,
  OrderAlreadyAssignedError,
  OrderNotFoundForDeliveryError,
  PickupOrderCannotBeAssignedError,
  assignCarrier,
} from '@store-mgmt/domain';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { backendPid, backendsBlockedBy, rowIsLocked, waitUntil } from '../lock-wait.spec-helper.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCarrierRepository } from './prisma-carrier.repository.js';
import { PrismaDeliveryAssignmentRepository } from './prisma-delivery-assignment.repository.js';
import {
  seedDeliveryFixtureBase,
  createDeliveryOrderFixture,
  wipeDeliveryFixture,
  type DeliveryFixtureBase,
} from './delivery-fixtures.spec-helper.js';

/**
 * Real Postgres, against a provisioned tenant schema. Covers the `orderId`
 * UNIQUE guarantee (D1), the nullable `findByOrderId` (never throws), the
 * `list` filter, and `countOrdersAwaitingCarrier`'s anti-join — the property
 * the whole "orders awaiting a carrier" read depends on (design §4).
 */
describe('PrismaDeliveryAssignmentRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let carrierRepository: PrismaCarrierRepository;
  let repository: PrismaDeliveryAssignmentRepository;
  let base: DeliveryFixtureBase;
  let carrierId: string;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    carrierRepository = new PrismaCarrierRepository(tenantContext);
    repository = new PrismaDeliveryAssignmentRepository(tenantContext);
  });

  beforeEach(async () => {
    base = await seedDeliveryFixtureBase(tenantContext.getClient());
    const carrier = await carrierRepository.create({ name: 'Assignment Carrier' });
    carrierId = carrier.id;
  });

  afterEach(async () => {
    await wipeDeliveryFixture(tenantContext.getClient());
  });

  async function verifiedDeliveryOrder(): Promise<string> {
    const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
      deliveryMode: 'delivery',
      status: 'verified',
    });
    return orderId;
  }

  it('creates an assignment and round-trips it by id', async () => {
    const orderId = await verifiedDeliveryOrder();
    const assignment = assignCarrier({ orderId, carrierId }, new Date('2026-08-01T10:00:00.000Z'));

    const created = await repository.create(assignment);

    expect(created.status).toBe('in_transit');
    expect(created.deliveredAt).toBeNull();
    const reread = await repository.findById(created.id);
    expect(reread!.orderId).toBe(orderId);
    expect(reread!.carrierId).toBe(carrierId);
  });

  it('rejects a duplicate orderId as OrderAlreadyAssignedError — the UNIQUE index is the guarantee, translated', async () => {
    const orderId = await verifiedDeliveryOrder();
    const at = new Date('2026-08-01T10:00:00.000Z');
    await repository.create(assignCarrier({ orderId, carrierId }, at));

    const secondCarrier = await carrierRepository.create({ name: 'Second Carrier' });
    // Raw P2002 here means a 500 for a request the client CAN act on. Two
    // concurrent assigns (a double-clicked button suffices) lose the
    // `findByOrderId` pre-check race and land exactly here.
    await expect(
      repository.create(assignCarrier({ orderId, carrierId: secondCarrier.id }, at)),
    ).rejects.toThrow(OrderAlreadyAssignedError);
  });

  /**
   * NAMED FOR WHAT THEY PROVE. These two were called "… not raw P2003", which
   * claimed they exercised the FK translation branches in
   * `translateCreateConstraintError`. They never reach them: the locked
   * re-read runs `assertOrderAssignable` BEFORE the insert, so a missing
   * order/carrier is refused by the GUARD and no FK is ever touched — which
   * the adapter's own doc comment concedes ("the two P2003 branches are a
   * BACKSTOP and are not reachable as the code stands"). A test named after a
   * branch it cannot reach is worse than no test: it reads as coverage.
   *
   * What they DO prove, and what is worth proving, is that the guard answers
   * a missing row with a named domain error rather than letting anything raw
   * escape.
   */
  it('rejects an unknown orderId as OrderNotFoundForDeliveryError — the locked re-read answers it, before any FK', async () => {
    await expect(
      repository.create(
        assignCarrier({ orderId: randomUUID(), carrierId }, new Date('2026-08-01T10:00:00.000Z')),
      ),
    ).rejects.toThrow(OrderNotFoundForDeliveryError);
  });

  it('rejects an unknown carrierId as CarrierNotFoundError — the locked re-read answers it, before any FK', async () => {
    const orderId = await verifiedDeliveryOrder();

    await expect(
      repository.create(
        assignCarrier({ orderId, carrierId: randomUUID() }, new Date('2026-08-01T10:00:00.000Z')),
      ),
    ).rejects.toThrow(CarrierNotFoundError);
  });

  it('findByOrderId returns null for a pickup/no-assignment order — never throws', async () => {
    const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
      deliveryMode: 'pickup',
      status: 'delivered',
    });

    await expect(repository.findByOrderId(orderId)).resolves.toBeNull();
  });

  describe('list', () => {
    it('filters by carrierId', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderIdA = await verifiedDeliveryOrder();
      const orderIdB = await verifiedDeliveryOrder();
      const otherCarrier = await carrierRepository.create({ name: 'Other Carrier' });
      const mine = await repository.create(assignCarrier({ orderId: orderIdA, carrierId }, at));
      await repository.create(assignCarrier({ orderId: orderIdB, carrierId: otherCarrier.id }, at));

      const scoped = await repository.list({ carrierId });

      expect(scoped.map((a) => a.id)).toEqual([mine.id]);
    });

    it('filters by status', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderIdA = await verifiedDeliveryOrder();
      const orderIdB = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId: orderIdA, carrierId }, at));
      const delivered = await tenantContext.getClient().deliveryAssignment.create({
        data: {
          orderId: orderIdB,
          carrierId,
          status: 'delivered',
          assignedAt: at,
          deliveredAt: new Date('2026-08-02T10:00:00.000Z'),
        },
      });

      const inTransit = await repository.list({ status: 'in_transit' });
      const delivered_ = await repository.list({ status: 'delivered' });

      expect(inTransit.map((a) => a.orderId)).toEqual([orderIdA]);
      expect(delivered_.map((a) => a.id)).toEqual([delivered.id]);
    });

    it('returns everything when no filter is given', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderIdA = await verifiedDeliveryOrder();
      const orderIdB = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId: orderIdA, carrierId }, at));
      await repository.create(assignCarrier({ orderId: orderIdB, carrierId }, at));

      expect(await repository.list()).toHaveLength(2);
    });
  });

  /**
   * `GET /delivery/assignments` served whole rows from `list`, which has no
   * row limit at all — every assignment in the tenant's history, on every
   * call. `listPage` is the bounded read that replaced it; `list` stays
   * unbounded on purpose for the two AGGREGATE callers, which fold every row
   * into a count and would under-report if truncated.
   */
  describe('listPage — the BOUNDED row-returning read', () => {
    const AT = new Date('2026-08-01T10:00:00.000Z');

    async function seedAssignments(count: number): Promise<string[]> {
      const ids: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const orderId = await verifiedDeliveryOrder();
        const created = await repository.create(
          assignCarrier({ orderId, carrierId }, new Date(AT.getTime() + i * 1_000)),
        );
        ids.push(created.id);
      }
      return ids;
    }

    it('returns at most `take` rows, newest first', async () => {
      await seedAssignments(3);

      const page = await repository.listPage({ take: 2 });

      expect(page).toHaveLength(2);
      expect(page[0]!.assignedAt.getTime()).toBeGreaterThan(page[1]!.assignedAt.getTime());
    });

    it('walks the whole set with a cursor, with no repeats and no gaps', async () => {
      const ids = await seedAssignments(5);

      const first = await repository.listPage({ take: 2 });
      const second = await repository.listPage({ take: 2, cursorId: first[1]!.id });
      const third = await repository.listPage({ take: 2, cursorId: second[1]!.id });

      const walked = [...first, ...second, ...third].map((a) => a.id);
      expect(new Set(walked).size).toBe(5);
      expect(walked.sort()).toEqual([...ids].sort());
    });

    it('bounds by the assignedAt window', async () => {
      const ids = await seedAssignments(3);

      const page = await repository.listPage({
        take: 50,
        assignedFrom: new Date(AT.getTime() + 2_000),
      });

      expect(page.map((a) => a.id)).toEqual([ids[2]]);
    });

    /**
     * A required `take` stops a caller forgetting to bound the read; the clamp
     * stops one "bounding" it with a number that is the whole table.
     */
    it('clamps an absurd take rather than honouring it', async () => {
      await seedAssignments(2);

      const page = await repository.listPage({ take: 1_000_000 });

      expect(page.length).toBeLessThanOrEqual(200);
    });
  });

  describe('countOrdersAwaitingCarrier', () => {
    it('counts only verified + delivery-mode + no-assignment orders (the anti-join)', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      // 2 orders that SHOULD count: verified, delivery, no assignment.
      await verifiedDeliveryOrder();
      await verifiedDeliveryOrder();
      // 1 order that must NOT count: verified, delivery, but already assigned.
      const assignedOrderId = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId: assignedOrderId, carrierId }, at));
      // 1 order that must NOT count: pickup mode.
      await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'pickup',
        status: 'verified',
      });
      // 1 order that must NOT count: delivery mode but not verified yet.
      await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'delivery',
        status: 'created',
      });

      expect(await repository.countOrdersAwaitingCarrier()).toBe(2);
    });
  });

  /**
   * CLASS E2 — `DeliveryService.assign` reads the order snapshot, checks
   * `status === 'verified'`, and then inserts in a SEPARATE unlocked
   * statement. If `POST /orders/:id/cancel` commits in between,
   * `cancelAssignmentOnOrderCancelTx` has already run and the new row lands
   * `in_transit` on a `cancelled` order — permanently unclosable, since
   * `markDelivered` on a cancelled order throws. The adapter therefore
   * re-validates the order INSIDE the same transaction as the insert, holding
   * a `FOR UPDATE` row lock on it.
   */
  describe('create re-validates the order inside the insert transaction', () => {
    const AT = new Date('2026-08-01T10:00:00.000Z');

    it('refuses a non-verified order with OrderNotAssignableStateError, and writes nothing', async () => {
      const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'delivery',
        status: 'created',
      });

      await expect(repository.create(assignCarrier({ orderId, carrierId }, AT))).rejects.toThrow(
        OrderNotAssignableStateError,
      );
      expect(await repository.findByOrderId(orderId)).toBeNull();
    });

    it('refuses a cancelled order — the exact row this whole guard exists to prevent', async () => {
      const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'delivery',
        status: 'cancelled',
      });

      await expect(repository.create(assignCarrier({ orderId, carrierId }, AT))).rejects.toThrow(
        OrderNotAssignableStateError,
      );
      expect(await repository.findByOrderId(orderId)).toBeNull();
    });

    it('refuses a pickup order with PickupOrderCannotBeAssignedError', async () => {
      const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'pickup',
        status: 'verified',
      });

      await expect(repository.create(assignCarrier({ orderId, carrierId }, AT))).rejects.toThrow(
        PickupOrderCannotBeAssignedError,
      );
      expect(await repository.findByOrderId(orderId)).toBeNull();
    });

    it('refuses an INACTIVE carrier — the carrier row is locked and re-read too', async () => {
      const orderId = await verifiedDeliveryOrder();
      const retired = await carrierRepository.create({ name: 'Retired Carrier' });
      await carrierRepository.softDelete(retired.id);

      await expect(
        repository.create(assignCarrier({ orderId, carrierId: retired.id }, AT)),
      ).rejects.toThrow(CarrierNotFoundError);
      expect(await repository.findByOrderId(orderId)).toBeNull();
    });

    /**
     * The race itself, driven for real: a concurrent transaction takes the
     * order's row lock, `create` is started (and blocks on that same lock),
     * the holder then cancels the order and commits. `create` must observe
     * the COMMITTED cancellation and refuse — not insert against the
     * `verified` status it would have read a moment earlier.
     *
     * Without the in-transaction re-read + lock this insert succeeds and
     * leaves exactly the stranded `in_transit`-behind-`cancelled` row this
     * whole change exists to eliminate.
     */
    it('loses to a concurrent cancel that commits first, instead of stranding a row', async () => {
      const orderId = await verifiedDeliveryOrder();
      const client = tenantContext.getClient();

      let openTheGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openTheGate = resolve;
      });

      // The HOLDER's own backend pid, captured inside its transaction, is what
      // lets the wait below be attributed to THIS lock rather than to any lock
      // anywhere in the database.
      let holderPid!: number;
      let holderPidReady!: () => void;
      const holderPidKnown = new Promise<void>((resolve) => {
        holderPidReady = resolve;
      });

      const cancelTx = client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "sales_order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
        holderPid = await backendPid(tx);
        holderPidReady();
        await gate;
        await tx.$executeRaw`UPDATE "sales_order" SET "status" = 'cancelled' WHERE "id" = ${orderId}::uuid`;
      }, LOCK_TRANSACTION_BUDGET);

      expect(await waitUntil(() => rowIsLocked(client, 'sales_order', orderId))).toBe(true);
      await holderPidKnown;

      const assignAttempt = repository.create(assignCarrier({ orderId, carrierId }, AT));
      // The assign transaction must REACH — and block on — the `FOR UPDATE`
      // the cancel transaction holds. This was a bare `setTimeout(300)` with
      // a comment asserting exactly that and nothing checking it; then it was
      // a count of every backend blocked on any lock in the database, which
      // any concurrently-running suite could satisfy on its own. Attributed
      // via `pg_blocking_pids` against the holder's own pid, it can only be
      // true because of the lock this test took.
      expect(await waitUntil(() => backendsBlockedBy(client, holderPid).then((n) => n > 0))).toBe(
        true,
      );

      openTheGate();
      await cancelTx;

      await expect(assignAttempt).rejects.toThrow(OrderNotAssignableStateError);
      expect(await repository.findByOrderId(orderId)).toBeNull();
    }, 40_000);

    /**
     * The mirror image, and the reason `create` locks the CARRIER row too:
     * `PrismaCarrierRepository.deactivateGuarded` counts open assignments
     * inside a transaction holding that same lock, so the two serialize.
     *
     * This test used to hand-roll the carrier `FOR UPDATE` and the insert
     * inside its OWN `$transaction` and never call `repository.create` at
     * all — so it proved that a lock taken by the test serializes against
     * `deactivateGuarded`, which nobody doubted. Deleting the carrier lock
     * from the real `create` left it green. It now drives `create` itself,
     * mirroring the cancel test's shape: `deactivateGuarded` takes the
     * carrier lock first and holds it, `create` must BLOCK on that lock, and
     * whichever commits second must see the other's effect.
     *
     * Here the deactivation commits first, so `create` observes
     * `active = false` and refuses with `CarrierNotFoundError` — the outcome
     * that is impossible unless `create` really locks and re-reads the
     * carrier.
     */
    it('blocks on a concurrent carrier deactivation and refuses once it commits', async () => {
      const orderId = await verifiedDeliveryOrder();
      const client = tenantContext.getClient();

      let openTheGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openTheGate = resolve;
      });

      let holderPid!: number;
      let holderPidReady!: () => void;
      const holderPidKnown = new Promise<void>((resolve) => {
        holderPidReady = resolve;
      });

      const deactivateTx = client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "active" FROM "carrier" WHERE "id" = ${carrierId}::uuid FOR UPDATE`;
        holderPid = await backendPid(tx);
        holderPidReady();
        await gate;
        await tx.carrier.update({ where: { id: carrierId }, data: { active: false } });
      }, LOCK_TRANSACTION_BUDGET);

      // The holder must really hold the lock before `create` is started, or
      // the two never contend and this proves nothing.
      expect(await waitUntil(() => rowIsLocked(client, 'carrier', carrierId))).toBe(true);
      await holderPidKnown;

      const assignAttempt = repository.create(assignCarrier({ orderId, carrierId }, AT));
      // `create` must be BLOCKED **on this holder's** carrier lock — polled,
      // not slept through, and attributed rather than merely counted across
      // the whole database.
      expect(await waitUntil(() => backendsBlockedBy(client, holderPid).then((n) => n > 0))).toBe(
        true,
      );

      openTheGate();
      await deactivateTx;

      await expect(assignAttempt).rejects.toThrow(CarrierNotFoundError);
      expect(await repository.findByOrderId(orderId)).toBeNull();
    }, 40_000);

    /**
     * NAMED FOR WHAT IT PROVES. This was called "makes a CONCURRENT
     * deactivation see an assignment that committed first" while being fully
     * sequential — create, await, then `softDelete`. No two transactions ever
     * overlap in it, so it says nothing about serialization; deleting the
     * carrier lock from `create` leaves it green.
     *
     * The concurrent half of that claim is already covered, for real, by
     * `blocks on a concurrent carrier deactivation and refuses once it
     * commits` two tests up — which drives both sides through the production
     * code, waits for attributed contention, and asserts the outcome. What is
     * left here is the SEQUENTIAL property, which is a genuine and separate
     * thing to check: a committed `in_transit` assignment blocks deactivation
     * and leaves no lock behind.
     */
    it('refuses a deactivation while a committed in_transit assignment exists, and releases its lock', async () => {
      const orderId = await verifiedDeliveryOrder();
      const client = tenantContext.getClient();

      await repository.create(assignCarrier({ orderId, carrierId }, AT));

      await expect(carrierRepository.softDelete(carrierId)).rejects.toThrow(
        CarrierHasOpenAssignmentsError,
      );
      expect((await carrierRepository.findById(carrierId))!.active).toBe(true);
      expect(await rowIsLocked(client, 'carrier', carrierId)).toBe(false);
    });
  });

  /** CLASS D3 — the warehouse scope Sales applies to its own list, pushed into the query. */
  describe('list filters by the ORDER\'s warehouse', () => {
    it('returns only assignments whose order belongs to the given warehouse', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const mineOrderId = await verifiedDeliveryOrder();
      const mine = await repository.create(assignCarrier({ orderId: mineOrderId, carrierId }, at));

      const otherBase = await seedDeliveryFixtureBase(tenantContext.getClient());
      const { orderId: otherOrderId } = await createDeliveryOrderFixture(
        tenantContext.getClient(),
        otherBase,
        { deliveryMode: 'delivery', status: 'verified' },
      );
      await repository.create(assignCarrier({ orderId: otherOrderId, carrierId }, at));

      const scoped = await repository.list({ orderWarehouseId: base.warehouseId });

      expect(scoped.map((a) => a.id)).toEqual([mine.id]);
    });

    it('returns nothing for a warehouse with no orders', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderId = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId, carrierId }, at));

      expect(await repository.list({ orderWarehouseId: randomUUID() })).toHaveLength(0);
    });
  });
});
