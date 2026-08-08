import { Injectable } from '@nestjs/common';
import type {
  DeliveryAssignment as DomainDeliveryAssignment,
  DeliveryAssignmentFilter,
  DeliveryAssignmentPageFilter,
  DeliveryAssignmentStatus,
  DeliveryMode,
  IDeliveryAssignmentRepository,
  OrderStatus,
} from '@store-mgmt/domain';
import {
  CarrierNotFoundError,
  OrderAlreadyAssignedError,
  OrderNotFoundForDeliveryError,
  assertOrderAssignable,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { translateTransactionError } from '../transaction-errors.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { violatedConstraintCovers, violatedConstraintIs } from './prisma-constraint-target.js';

/** Shape of every row Prisma returns for the `DeliveryAssignment` model. */
interface DeliveryAssignmentRow {
  readonly id: string;
  readonly orderId: string;
  readonly carrierId: string;
  readonly status: DeliveryAssignmentStatus;
  readonly assignedAt: Date;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: DeliveryAssignmentRow): DomainDeliveryAssignment {
  return {
    id: row.id,
    orderId: row.orderId,
    carrierId: row.carrierId,
    status: row.status,
    assignedAt: row.assignedAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The three constraints on `delivery_assignment` that a `create` can violate,
 * spelled exactly as `prisma/tenant-schema.sql` declares them. Named
 * constants rather than inline substrings so a schema rename is a compile-
 * adjacent, greppable edit instead of a silently unreachable branch — the same
 * discipline `prisma-carrier-warehouse.repository.ts` already applies to its
 * own three.
 */
/**
 * The hard ceiling on one `listPage` call, whatever `take` the caller names.
 *
 * A required `take` stops a caller forgetting to bound the read; this stops
 * one from "bounding" it with `take: 1_000_000`, which is the same unbounded
 * scan wearing a number.
 */
const MAX_ASSIGNMENT_PAGE_SIZE = 200;

const ASSIGNMENT_ORDER_UNIQUE_INDEX = 'delivery_assignment_order_id_key';
/** The same constraint, as the query engine reports it: the field list, not the index name. */
const ASSIGNMENT_ORDER_UNIQUE_FIELDS = ['order_id'] as const;
const ASSIGNMENT_ORDER_FK = 'delivery_assignment_order_id_fkey';
const ASSIGNMENT_CARRIER_FK = 'delivery_assignment_carrier_id_fkey';

/**
 * Translates the constraint violations `create` can hit into the named domain
 * errors the service layer and controller already know how to map.
 *
 * The UNIQUE index remains THE guarantee (design §4/§8, spec) — this does not
 * replace it with an application check, it only reports it in the domain's own
 * vocabulary. `DeliveryService.assign` pre-checks with `findByOrderId`, but
 * that check and the `create` are not in one transaction and take no lock, so
 * two concurrent assigns (a double-clicked button suffices) race: the loser
 * hits `delivery_assignment_order_id_key` and, uncaught, surfaced raw P2002 as
 * a 500. The spec requires a rejection the client can act on — 409.
 *
 * Same reasoning for P2003 on either FK: an `orderId`/`carrierId` that vanished
 * (or never existed) is a 404-class fact about the request, not a server fault.
 *
 * REACHABILITY, stated honestly. P2002 is LIVE: two concurrent `create`s
 * serialize on the order's row lock, but neither consults the existing
 * assignment, so the second reaches the insert and hits
 * `delivery_assignment_order_id_key`. The two P2003 branches are a BACKSTOP
 * and are not reachable as the code stands — `assertOrderAssignable` already
 * rejects a missing order and a missing carrier, and both rows are held `FOR
 * UPDATE` from then until COMMIT, so neither can disappear underneath the
 * insert. They are kept because the FK is the real enforcement and this
 * translator is what stops a raw Prisma code becoming a 500 if that lock is
 * ever weakened; they are NOT evidence that the DB currently answers these
 * requests. Anything relying on them being exercised should test the FK
 * directly.
 *
 * EVERY branch names the WHOLE constraint. These branches used to test bare
 * column substrings (`target.includes('carrier_id')` before
 * `target.includes('order_id')`), which is order-dependent and correct only by
 * accident of how Prisma spells these names — `delivery_assignment_order_id_fkey`
 * happens not to contain `carrier_id`, and vice versa. Rename either one and
 * the two branches silently swap meanings. `violatedConstraintIs` was extracted
 * to `prisma-constraint-target.ts` precisely to kill that pattern, and the
 * coverage translator was converted to it while this one — its own sibling —
 * was left behind.
 *
 * Anything a constraint did not cause is handed to `translateTransactionError`
 * before being returned. This function used to return everything unrecognised
 * UNCHANGED, and it wraps the whole `$transaction` — so the two failures the
 * LOCKING itself made reachable, a blown budget (`P2028`) and a deadlock
 * (`40P01`), fell straight through it as 500s. That is the mechanism added to
 * stop one class of 500 producing another; `lock-budget.ts`'s own comment says
 * P2028 "is exactly the outcome the locking was introduced to prevent".
 * Anything neither branch recognises is still returned unchanged.
 */
function translateCreateConstraintError(err: unknown, assignment: DomainDeliveryAssignment): unknown {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return translateTransactionError(err, 'PrismaDeliveryAssignmentRepository.create');
  }
  if (
    err.code === 'P2002' &&
    // Two shapes, both real: a P2002 raised through the query engine reports
    // `meta.target` as the FIELD LIST, while the driver adapter reports the
    // INDEX NAME. Either identifies the one-assignment-per-order constraint.
    (violatedConstraintIs(err, ASSIGNMENT_ORDER_UNIQUE_INDEX) ||
      violatedConstraintCovers(err, ASSIGNMENT_ORDER_UNIQUE_FIELDS))
  ) {
    return new OrderAlreadyAssignedError(assignment.orderId);
  }
  if (err.code === 'P2003') {
    if (violatedConstraintIs(err, ASSIGNMENT_CARRIER_FK)) {
      return new CarrierNotFoundError(assignment.carrierId);
    }
    if (violatedConstraintIs(err, ASSIGNMENT_ORDER_FK)) {
      return new OrderNotFoundForDeliveryError(assignment.orderId);
    }
  }
  return translateTransactionError(err, 'PrismaDeliveryAssignmentRepository.create');
}

/** The order row as this adapter reads it back under lock — enum columns cast to `text` so no client-side enum mapping is involved. */
interface LockedOrderRow {
  readonly status: string;
  readonly delivery_mode: string;
}

/** The carrier row as this adapter reads it back under lock. */
interface LockedCarrierRow {
  readonly active: boolean;
}

/**
 * Prisma adapter for `IDeliveryAssignmentRepository`. `create` writes the
 * already-built entity verbatim (mirrors `PrismaOrderRepository.create` —
 * `assignCarrier()` already minted the id/status/assignedAt); the `order_id`
 * UNIQUE index and both FKs stay the enforcement, and their violations are
 * translated into named domain errors by `translateCreateConstraintError`
 * rather than escaping as raw Prisma codes (design §4/§8, spec: "the UNIQUE
 * index IS the guarantee").
 *
 * `create` runs in ONE transaction that first takes `FOR UPDATE` row locks on
 * the order and the carrier and RE-VALIDATES both. `DeliveryService.assign`'s
 * own checks read the order in a separate, unlocked statement — so a
 * `POST /orders/:id/cancel` committing between that read and this insert left
 * the new row `in_transit` behind a `cancelled` order
 * (`cancelAssignmentOnOrderCancelTx` had already run), and NO API path can
 * close such a row: `markDelivered` on a cancelled order throws. The service
 * checks remain the fast path with the clearer message; these are the ones a
 * concurrent writer cannot step around. The carrier lock is the same one
 * `PrismaCarrierRepository.deactivateGuarded` takes, so assign and
 * deactivation serialize instead of interleaving.
 *
 * Lock ORDER is always order-then-carrier here, and carrier-only in the
 * deactivation path, so the two can never form a cycle.
 *
 * There is deliberately NO `markDelivered` here — see the port's own doc
 * comment. The delivered edge has exactly one writer,
 * `closeAssignmentOnDeliveryTx` (Phase 5).
 *
 * `countOrdersAwaitingCarrier` is a raw-SQL anti-join against `sales_order`
 * LEFT JOIN `delivery_assignment` (design §4/§9 — `"order"` is a reserved
 * word, `Order` maps to `sales_order`). Raw SQL here resolves against the
 * tenant schema because `TenantPrismaFactory` sets `search_path` on the
 * underlying connection itself (design.md §4) — the same reason
 * `applyReservationTx`'s raw `$executeRaw` needs no schema qualification.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this`.
 */
@Injectable()
export class PrismaDeliveryAssignmentRepository implements IDeliveryAssignmentRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(assignment: DomainDeliveryAssignment): Promise<DomainDeliveryAssignment> {
    try {
      return await this.tenantContext.getClient().$transaction(async (tx) => {
        // `::text` on both enum columns: this read only compares strings, and
        // casting here keeps the statement independent of whether the tenant
        // schema's enum has caught up with the datamodel (see
        // `cancel-assignment-on-order-cancel.ts` for what a plan-time enum
        // literal costs).
        const orderRows = await tx.$queryRaw<LockedOrderRow[]>(
          Prisma.sql`SELECT "status"::text AS status, "delivery_mode"::text AS delivery_mode
                     FROM "sales_order" WHERE "id" = ${assignment.orderId}::uuid FOR UPDATE`,
        );
        const order = orderRows[0];

        // Locked BEFORE any rule is evaluated, and unconditionally: the lock
        // ORDER is order-then-carrier, and short-circuiting on the order's
        // state would make it conditional. One wasted single-row read when
        // the order does not exist is the price of an ordering that is the
        // same on every path.
        const carrierRows = await tx.$queryRaw<LockedCarrierRow[]>(
          Prisma.sql`SELECT "active" FROM "carrier" WHERE "id" = ${assignment.carrierId}::uuid FOR UPDATE`,
        );

        // THE decision, in the domain, shared verbatim with
        // `DeliveryService.assign`. This adapter re-reads under lock — it does
        // not get to re-decide what "assignable" means. The four rules used to
        // be spelled out here a second time, so changing one of them meant
        // editing two files in two layers and nothing failed if you edited
        // only one.
        assertOrderAssignable({
          orderId: assignment.orderId,
          carrierId: assignment.carrierId,
          order: order
            ? {
                deliveryMode: order.delivery_mode as DeliveryMode,
                status: order.status as OrderStatus,
              }
            : null,
          carrier: carrierRows[0] ?? null,
        });

        const row = await tx.deliveryAssignment.create({
          data: {
            id: assignment.id,
            orderId: assignment.orderId,
            carrierId: assignment.carrierId,
            status: assignment.status,
            assignedAt: assignment.assignedAt,
            deliveredAt: assignment.deliveredAt,
            createdAt: assignment.createdAt,
            updatedAt: assignment.updatedAt,
          },
        });
        return toDomain(row);
      }, LOCK_TRANSACTION_BUDGET);
    } catch (err) {
      throw translateCreateConstraintError(err, assignment);
    }
  }

  async findById(id: string): Promise<DomainDeliveryAssignment | null> {
    const row = await this.tenantContext.getClient().deliveryAssignment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<DomainDeliveryAssignment | null> {
    const row = await this.tenantContext.getClient().deliveryAssignment.findUnique({ where: { orderId } });
    return row ? toDomain(row) : null;
  }

  /**
   * The COMPLETE set — no `take`, on purpose. Its only callers are the two
   * AGGREGATE reads in `getCarrierCapacity`, which fold every row into a
   * count; a row limit here would make the dashboard under-report. They are
   * bounded by a WINDOW instead. See the port's own doc comment, and
   * `listPage` for the row-returning read.
   */
  async list(filter?: DeliveryAssignmentFilter): Promise<DomainDeliveryAssignment[]> {
    const rows = await this.tenantContext.getClient().deliveryAssignment.findMany({
      where: {
        ...(filter?.carrierId !== undefined ? { carrierId: filter.carrierId } : {}),
        ...(filter?.status !== undefined ? { status: filter.status } : {}),
        // The warehouse scope, pushed into the query through the
        // `delivery_assignment -> sales_order` relation rather than filtered
        // in memory afterwards — a scoped operator must never receive the
        // other warehouses' rows over the wire in the first place.
        ...(filter?.orderWarehouseId !== undefined
          ? { order: { warehouseId: filter.orderWarehouseId } }
          : {}),
        ...(filter?.deliveredFrom !== undefined || filter?.deliveredTo !== undefined
          ? {
              deliveredAt: {
                ...(filter?.deliveredFrom !== undefined ? { gte: filter.deliveredFrom } : {}),
                ...(filter?.deliveredTo !== undefined ? { lte: filter.deliveredTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }

  /**
   * One BOUNDED page.
   *
   * `take` is required by the type AND clamped to `MAX_ASSIGNMENT_PAGE_SIZE`
   * here — the type stops a caller from forgetting, the clamp stops one from
   * asking for the whole table by passing a huge number.
   *
   * `orderBy` carries an `id` tiebreak after `assignedAt`, which is what makes
   * `cursorId` a STABLE keyset: two assignments written in one transaction
   * share an `assignedAt`, and a cursor on a non-unique key either skips rows
   * or repeats them. `skip: 1` is Prisma's keyset form — the cursor row was
   * the last row of the previous page and must not come back twice.
   */
  async listPage(filter: DeliveryAssignmentPageFilter): Promise<DomainDeliveryAssignment[]> {
    const take = Math.max(1, Math.min(filter.take, MAX_ASSIGNMENT_PAGE_SIZE));
    const rows = await this.tenantContext.getClient().deliveryAssignment.findMany({
      take,
      ...(filter.cursorId !== undefined ? { cursor: { id: filter.cursorId }, skip: 1 } : {}),
      where: {
        ...(filter.carrierId !== undefined ? { carrierId: filter.carrierId } : {}),
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.assignedFrom !== undefined || filter.assignedTo !== undefined
          ? {
              assignedAt: {
                ...(filter.assignedFrom !== undefined ? { gte: filter.assignedFrom } : {}),
                ...(filter.assignedTo !== undefined ? { lte: filter.assignedTo } : {}),
              },
            }
          : {}),
        ...(filter.orderWarehouseId !== undefined
          ? { order: { warehouseId: filter.orderWarehouseId } }
          : {}),
      },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }

  /**
   * `verified` + `delivery` mode + NO assignment row at all.
   *
   * NOTE WHAT "no assignment row" MEANS AND DOES NOT MEAN. The anti-join is on
   * the ROW's existence, not on its status, so an order whose assignment is
   * `cancelled` counts as "has a carrier" and drops out of this number — while
   * the `order_id` UNIQUE index means it can never be given another one
   * either. Such an order would be silently stranded: invisible to this read
   * AND unassignable.
   *
   * That state is UNREACHABLE today, and only because of an invariant that
   * lives entirely outside this query: `cancelled` is written in exactly two
   * places — `cancelAssignmentOnOrderCancelTx`, inside
   * `PrismaOrderRepository.cancel`'s transaction, and
   * `sweepStrandedAssignments`, which only touches rows whose order is already
   * `cancelled` — so every `cancelled` assignment belongs to a `cancelled`
   * order, which this query excludes by `so."status" = 'verified'` anyway.
   *
   * DO NOT WRITE `cancelled` FROM ANYWHERE ELSE without changing this query
   * first. Tolerating it here instead (`da."id" IS NULL OR da."status" =
   * 'cancelled'`) was considered and rejected: it would count an order this
   * schema cannot actually accept an assignment for, which is a lie in the
   * other direction.
   */
  async countOrdersAwaitingCarrier(): Promise<number> {
    const rows = await this.tenantContext.getClient().$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "sales_order" so
        LEFT JOIN "delivery_assignment" da ON da."order_id" = so."id"
        WHERE so."status" = 'verified'
          AND so."delivery_mode" = 'delivery'
          AND da."id" IS NULL
      `,
    );
    return rows[0]?.count ?? 0;
  }
}
