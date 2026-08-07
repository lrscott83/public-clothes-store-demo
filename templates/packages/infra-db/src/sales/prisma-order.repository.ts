import { Injectable } from '@nestjs/common';
import type {
  Currency,
  DeliveryMode,
  IOrderRepository,
  Order as DomainOrder,
  OrderLine as DomainOrderLine,
  OrderListFilter,
  OrderPayment as DomainOrderPayment,
  OrderScopeProjection,
  OrderStatus,
  OrderUpdateInput,
  PaymentChannel,
  SaleCredit as DomainSaleCredit,
} from '@store-mgmt/domain';
import {
  CHANNEL_CURRENCY,
  InvalidOrderStateError,
  moneyFromDecimalString,
  moneyToDecimalString,
  percentFromDecimalString,
  percentToDecimalString,
  discountPriceFromDecimalString,
  discountPriceToDecimalString,
  rateFromDecimalString,
  rateToDecimalString,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { withTransactionErrorMapping } from '../transaction-errors.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { applyReservationTx } from '../inventory/apply-reservation.js';
import { applyStockMovementTx } from '../inventory/apply-stock-movement.js';
import { cancelAssignmentOnOrderCancelTx } from '../delivery/cancel-assignment-on-order-cancel.js';
import { closeAssignmentOnDeliveryTx } from '../delivery/close-assignment-on-delivery.js';

/** Row shapes shared by every Prisma read of the `Order` aggregate. */
interface OrderLineRow {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly categoryName: string;
  readonly price: { toString(): string };
  readonly priceCurrency: string;
  readonly percentDiscountPrice: { toString(): string };
  readonly discountPrice: { toString(): string };
  readonly quantity: number;
  readonly unitFinalPrice: { toString(): string };
  readonly lineTotalNative: { toString(): string };
  readonly rateApplied: { toString(): string };
  readonly rateChannel: string;
  readonly rateEffectiveFrom: Date;
  readonly lineTotalOrder: { toString(): string };
}

interface OrderPaymentRow {
  readonly id: string;
  readonly channel: string;
  readonly amount: { toString(): string };
  readonly rateApplied: { toString(): string };
  readonly rateChannel: string;
  readonly rateEffectiveFrom: Date;
  readonly amountInOrderCurrency: { toString(): string };
}

interface SaleCreditRow {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly total: { toString(): string };
  readonly paid: { toString(): string };
  readonly rateApplied: { toString(): string };
  readonly rateChannel: string;
  readonly rateEffectiveFrom: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface OrderRow {
  readonly id: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly deliveryMode: string;
  readonly currency: string;
  readonly status: string;
  /** `null` only for rows predating the attribution migration — never backfilled. */
  readonly attributedCompanyUserId: string | null;
  readonly subtotal: { toString(): string };
  readonly discountTotal: { toString(): string };
  readonly total: { toString(): string };
  readonly orderDate: Date;
  readonly verifiedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly OrderLineRow[];
  readonly payments: readonly OrderPaymentRow[];
  readonly saleCredit: SaleCreditRow | null;
}

/** Prisma's `include` shape shared by every full-aggregate read. */
const AGGREGATE_INCLUDE = { lines: true, payments: true, saleCredit: true } as const;

/**
 * The `include` every STATUS TRANSITION reads its lines through.
 *
 * `orderBy: { productId: 'asc' }` is a LOCK ORDER, not presentation. Each
 * iteration of the per-line loop takes a `stock_level` row lock (via
 * `applyReservationTx`/`applyStockMovementTx`'s guarded UPDATE) and holds it
 * until COMMIT, so the loop's order IS the order those locks are acquired in.
 * Without it, Postgres returns the lines in whatever order it likes — in
 * practice insertion order, which differs from order to order. Two concurrent
 * transitions on DIFFERENT orders sharing the same products, entered in
 * opposite line order, then take the same two locks in opposite order: a
 * cycle, `40P01`, and an untranslated 500 for whichever one Postgres picks as
 * the victim.
 *
 * `lockOrderRowTx` closed the ordering BETWEEN steps (order -> stock ->
 * assignment). This closes it WITHIN the stock step, which is the half its
 * comment used to claim without delivering. Both halves are needed; either
 * alone still admits a cycle.
 *
 * Sorting by `productId` and not by `id`: the lock is on the `stock_level`
 * row, which is keyed by `(productId, warehouseId)`. A transition only ever
 * touches ONE warehouse (`orderRow.warehouseId`), so `productId` alone
 * totally orders the rows this loop can lock.
 */
const TRANSITION_LINES_INCLUDE = {
  lines: { orderBy: { productId: 'asc' } },
} as const satisfies Prisma.OrderInclude;

/**
 * Takes an exclusive row lock on the order, as the FIRST statement of every
 * status transition.
 *
 * WHY: `PrismaDeliveryAssignmentRepository.create` re-validates the order's
 * status under this same lock before inserting, because a `cancel` committing
 * between `DeliveryService.assign`'s snapshot read and its insert stranded the
 * new row `in_transit` behind a `cancelled` order — unclosable by any API
 * path. That lock only helps if the transitions take it too: `cancel` used to
 * run `cancelAssignmentOnOrderCancelTx` BEFORE it ever touched the order row,
 * so an assign could still slip in behind it.
 *
 * WHY IN ALL THREE and not only `cancel`: lock ORDER. Every transition ends by
 * updating the order row (which locks it) after having locked stock rows in
 * its loop. Adding an upfront order lock to only some of them would leave
 * `confirm` taking stock-then-order while `cancel` took order-then-stock —
 * a cycle, i.e. a deadlock between a concurrent `confirm` and `cancel` of the
 * SAME order. Taking the order lock first EVERYWHERE keeps one ordering
 * BETWEEN THE STEPS: order -> stock -> (assignment).
 *
 * That is only HALF of a global ordering, and this comment used to claim the
 * whole of it. The rows within the stock step must be ordered too, or two
 * transitions on different orders sharing products still deadlock inside that
 * step — see `TRANSITION_LINES_INCLUDE`, which supplies the other half.
 *
 * Uses `$queryRaw` rather than a Prisma read because Prisma has no `FOR
 * UPDATE`; the tenant `search_path` is set on the connection itself (design.md
 * §4), so the table needs no schema qualification — the same reason
 * `applyReservationTx`'s raw SQL does not qualify it either.
 *
 * `$queryRaw`, not `$executeRaw`: this is a SELECT. Both work, but the other
 * two lock sites in this module (`PrismaCarrierRepository.deactivateGuarded`
 * and `PrismaDeliveryAssignmentRepository.create`) already read their locked
 * rows with `$queryRaw`, and three lock sites written in two idioms invites
 * the reader to look for a difference that is not there.
 */
async function lockOrderRowTx(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "sales_order" WHERE "id" = ${id}::uuid FOR UPDATE`);
}

function lineToDomain(row: OrderLineRow, orderCurrency: Currency): DomainOrderLine {
  const nativeCurrency = row.priceCurrency as Currency;
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    categoryName: row.categoryName,
    price: moneyFromDecimalString(row.price.toString(), nativeCurrency),
    percentDiscountPrice: percentFromDecimalString(row.percentDiscountPrice.toString()),
    discountPrice: discountPriceFromDecimalString(row.discountPrice.toString()),
    quantity: row.quantity,
    unitFinalPrice: moneyFromDecimalString(row.unitFinalPrice.toString(), nativeCurrency),
    lineTotalNative: moneyFromDecimalString(row.lineTotalNative.toString(), nativeCurrency),
    // `id` is intentionally absent on reconstruction — the frozen snapshot
    // only persists channel+rate+effectiveFrom (see schema.prisma module
    // deviation note); whether the original resolved rate was synthetic or a
    // real persisted row is not needed once frozen.
    rateApplied: {
      channel: row.rateChannel as PaymentChannel,
      rate: rateFromDecimalString(row.rateApplied.toString()),
      effectiveFrom: row.rateEffectiveFrom,
    },
    rateEffectiveFrom: row.rateEffectiveFrom,
    lineTotalOrder: moneyFromDecimalString(row.lineTotalOrder.toString(), orderCurrency),
  };
}

function paymentToDomain(row: OrderPaymentRow, orderCurrency: Currency): DomainOrderPayment {
  const channel = row.channel as PaymentChannel;
  return {
    id: row.id,
    channel,
    // `amount` currency is `CHANNEL_CURRENCY[channel]`, closed/derivable —
    // stored as a bare Decimal with no redundant currency column.
    amount: moneyFromDecimalString(row.amount.toString(), CHANNEL_CURRENCY[channel]),
    rateApplied: {
      channel: row.rateChannel as PaymentChannel,
      rate: rateFromDecimalString(row.rateApplied.toString()),
      effectiveFrom: row.rateEffectiveFrom,
    },
    rateEffectiveFrom: row.rateEffectiveFrom,
    amountInOrderCurrency: moneyFromDecimalString(row.amountInOrderCurrency.toString(), orderCurrency),
  };
}

function saleCreditToDomain(row: SaleCreditRow, orderCurrency: Currency): DomainSaleCredit {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId: row.customerId,
    total: moneyFromDecimalString(row.total.toString(), orderCurrency),
    paid: moneyFromDecimalString(row.paid.toString(), orderCurrency),
    rateApplied: {
      channel: row.rateChannel as PaymentChannel,
      rate: rateFromDecimalString(row.rateApplied.toString()),
      effectiveFrom: row.rateEffectiveFrom,
    },
    rateEffectiveFrom: row.rateEffectiveFrom,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function orderToDomain(row: OrderRow): DomainOrder {
  const currency = row.currency as Currency;
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    warehouseId: row.warehouseId,
    deliveryMode: row.deliveryMode as DeliveryMode,
    currency,
    status: row.status as OrderStatus,
    subtotal: moneyFromDecimalString(row.subtotal.toString(), currency),
    discountTotal: moneyFromDecimalString(row.discountTotal.toString(), currency),
    total: moneyFromDecimalString(row.total.toString(), currency),
    lines: row.lines.map((line) => lineToDomain(line, currency)),
    payments: row.payments.map((payment) => paymentToDomain(payment, currency)),
    saleCredit: row.saleCredit ? saleCreditToDomain(row.saleCredit, currency) : null,
    attributedCompanyUserId: row.attributedCompanyUserId,
    orderDate: row.orderDate,
    verifiedAt: row.verifiedAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IOrderRepository`. `create()` is a DUMB PERSISTER
 * (design.md decision #1/#3): the caller (service layer, Phase 5) MUST run
 * the payload through the domain factory `createOrder()` first — the
 * resulting fully-validated `Order` is what arrives here, and since the
 * attribution work the port says so directly rather than typing the parameter
 * as the looser `CreateOrderInput`. This repository never recomputes currency,
 * totals, or per-line/payment conversions — it persists exactly what it is
 * given and reconstructs the identical shape on every read (`findById`
 * never re-resolves rates, `verified` snapshots stay read-only, see
 * `confirm`).
 *
 * `confirm`/`deliver`/`cancel` are the three atomic status transitions
 * (design.md decision #8), each ONE `prisma.$transaction` reusing the
 * shared infra-only guarded-UPDATE helpers `applyReservationTx`
 * (`reserved`) and `applyStockMovementTx` (`onHand`, extracted from
 * `PrismaStockMovementRepository.record` this phase) — never a duplicated
 * guarded UPDATE. Every transition re-reads+re-checks the source `status`
 * INSIDE the transaction and throws `InvalidOrderStateError` on a mismatch;
 * any stock-guard failure (`InsufficientStockError`/`NegativeStockError`)
 * rolls back the WHOLE transaction, including the status change and any
 * earlier per-line mutation in the same call. `deliver` AND `cancel` each
 * additionally close any open `DeliveryAssignment` for the order in the SAME
 * transaction — `closeAssignmentOnDeliveryTx` and
 * `cancelAssignmentOnOrderCancelTx` respectively (delivery module,
 * design.md §2B) — the same guarded-UPDATE-inside-this-transaction shape,
 * two more `*Tx` helpers from another concept's infra folder, same
 * precedent. `cancel` needs its own because an assignment stranded by a
 * cancelled order has no other recovery path at all.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  /**
   * The ONE transaction shape for this class: the shared lock budget, plus the
   * translation of the failures that budget and the explicit locking make
   * reachable.
   *
   * These four transactions had NO translator at all. A deadlock (`40P01`) —
   * the exact outcome `TRANSITION_LINES_INCLUDE`'s lock ordering exists to
   * avoid, so the one that will actually happen if that ordering is ever
   * broken — and a blown budget (Prisma `P2028`, which `lock-budget.ts` calls
   * "exactly the outcome the locking was introduced to prevent") both reached
   * the controller as raw Prisma errors, i.e. 500s. Written as a helper rather
   * than repeated four times because the recurring defect in this area has
   * been fixing one call site and leaving its siblings.
   */
  private lockedTransaction<T>(
    operation: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withTransactionErrorMapping(operation, () =>
      this.tenantContext.getClient().$transaction(fn, LOCK_TRANSACTION_BUDGET),
    );
  }

  async create(order: DomainOrder): Promise<DomainOrder> {
    // The `input as unknown as Order` cast that used to open this method is
    // gone: the port now types `create` as taking the factory-built aggregate,
    // which is what every caller has always passed.
    const row = await this.lockedTransaction('PrismaOrderRepository.create', async (tx) => {
      const orderRow = await tx.order.create({
        data: {
          id: order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          warehouseId: order.warehouseId,
          deliveryMode: order.deliveryMode,
          currency: order.currency,
          status: order.status,
          attributedCompanyUserId: order.attributedCompanyUserId,
          subtotal: moneyToDecimalString(order.subtotal),
          discountTotal: moneyToDecimalString(order.discountTotal),
          total: moneyToDecimalString(order.total),
          orderDate: order.orderDate,
          verifiedAt: order.verifiedAt,
          deliveredAt: order.deliveredAt,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });

      if (order.lines.length > 0) {
        await tx.orderLine.createMany({
          data: order.lines.map((line) => ({
            id: line.id,
            orderId: orderRow.id,
            productId: line.productId,
            productName: line.productName,
            categoryName: line.categoryName,
            price: moneyToDecimalString(line.price),
            priceCurrency: line.price.currency,
            percentDiscountPrice: percentToDecimalString(line.percentDiscountPrice),
            discountPrice: discountPriceToDecimalString(line.discountPrice),
            quantity: line.quantity,
            unitFinalPrice: moneyToDecimalString(line.unitFinalPrice),
            lineTotalNative: moneyToDecimalString(line.lineTotalNative),
            rateApplied: rateToDecimalString(line.rateApplied.rate),
            rateChannel: line.rateApplied.channel,
            rateEffectiveFrom: line.rateEffectiveFrom,
            lineTotalOrder: moneyToDecimalString(line.lineTotalOrder),
          })),
        });
      }

      if (order.payments.length > 0) {
        await tx.orderPayment.createMany({
          data: order.payments.map((payment) => ({
            id: payment.id,
            orderId: orderRow.id,
            channel: payment.channel,
            amount: moneyToDecimalString(payment.amount),
            rateApplied: rateToDecimalString(payment.rateApplied.rate),
            rateChannel: payment.rateApplied.channel,
            rateEffectiveFrom: payment.rateEffectiveFrom,
            amountInOrderCurrency: moneyToDecimalString(payment.amountInOrderCurrency),
          })),
        });
      }

      if (order.saleCredit) {
        await tx.saleCredit.create({
          data: {
            id: order.saleCredit.id,
            orderId: orderRow.id,
            customerId: order.saleCredit.customerId,
            total: moneyToDecimalString(order.saleCredit.total),
            paid: moneyToDecimalString(order.saleCredit.paid),
            rateApplied: rateToDecimalString(order.saleCredit.rateApplied.rate),
            rateChannel: order.saleCredit.rateApplied.channel,
            rateEffectiveFrom: order.saleCredit.rateEffectiveFrom,
          },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderRow.id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }

  async update(id: string, patch: OrderUpdateInput): Promise<DomainOrder> {
    const row = await this.tenantContext.getClient().order.update({
      where: { id },
      // `attributedCompanyUserId` is ABSENT from this allow-list on purpose,
      // even though `OrderUpdateInput` is a `Partial<Order>` and so nominally
      // carries it. A sale is credited once, at creation; re-attributing it
      // later would move a commission from one agent to another with no trace.
      // Do not add it here.
      data: {
        ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
        ...(patch.warehouseId !== undefined ? { warehouseId: patch.warehouseId } : {}),
        ...(patch.deliveryMode !== undefined ? { deliveryMode: patch.deliveryMode } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.subtotal !== undefined ? { subtotal: moneyToDecimalString(patch.subtotal) } : {}),
        ...(patch.discountTotal !== undefined
          ? { discountTotal: moneyToDecimalString(patch.discountTotal) }
          : {}),
        ...(patch.total !== undefined ? { total: moneyToDecimalString(patch.total) } : {}),
        ...(patch.orderDate !== undefined ? { orderDate: patch.orderDate } : {}),
        ...(patch.verifiedAt !== undefined ? { verifiedAt: patch.verifiedAt } : {}),
        ...(patch.deliveredAt !== undefined ? { deliveredAt: patch.deliveredAt } : {}),
      },
      include: AGGREGATE_INCLUDE,
    });
    return orderToDomain(row);
  }

  async findById(id: string): Promise<DomainOrder | null> {
    const row = await this.tenantContext
      .getClient()
      .order.findUnique({ where: { id }, include: AGGREGATE_INCLUDE });
    return row ? orderToDomain(row) : null;
  }

  /**
   * Four columns, no `include`, no Money/rate reconstruction — the whole
   * point (see the port's own doc comment). `IOrderDeliveryGateway`'s
   * snapshot is served from here rather than from `findById`, which loads
   * lines, payments and credit to answer three scalars on the hot path of
   * every `assign`.
   */
  async findScopeProjection(id: string): Promise<OrderScopeProjection | null> {
    const row = await this.tenantContext.getClient().order.findUnique({
      where: { id },
      select: { id: true, warehouseId: true, deliveryMode: true, status: true },
    });
    if (!row) {
      return null;
    }
    return {
      orderId: row.id,
      warehouseId: row.warehouseId,
      deliveryMode: row.deliveryMode as DeliveryMode,
      status: row.status as OrderStatus,
    };
  }

  async list(filter?: OrderListFilter): Promise<DomainOrder[]> {
    const rows = await this.tenantContext.getClient().order.findMany({
      where: {
        ...(filter?.customerId ? { customerId: filter.customerId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: AGGREGATE_INCLUDE,
      orderBy: { orderDate: 'desc' },
    });
    return rows.map(orderToDomain);
  }

  async confirm(id: string): Promise<DomainOrder> {
    const row = await this.lockedTransaction('PrismaOrderRepository.confirm', async (tx) => {
      // FIRST statement of the transaction — see `lockOrderRowTx`.
      await lockOrderRowTx(tx, id);
      const orderRow = await tx.order.findUniqueOrThrow({ where: { id }, include: TRANSITION_LINES_INCLUDE });
      if (orderRow.status !== 'created') {
        throw new InvalidOrderStateError(id, 'created', orderRow.status);
      }

      for (const line of orderRow.lines) {
        await applyReservationTx(
          tx,
          { productId: line.productId, warehouseId: orderRow.warehouseId, quantity: line.quantity },
          'reserve',
        );
      }

      await tx.order.update({ where: { id }, data: { status: 'verified', verifiedAt: new Date() } });

      return tx.order.findUniqueOrThrow({ where: { id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }

  async deliver(id: string): Promise<DomainOrder> {
    const row = await this.lockedTransaction('PrismaOrderRepository.deliver', async (tx) => {
      // FIRST statement of the transaction — see `lockOrderRowTx`.
      await lockOrderRowTx(tx, id);
      const orderRow = await tx.order.findUniqueOrThrow({ where: { id }, include: TRANSITION_LINES_INCLUDE });
      if (orderRow.status !== 'verified') {
        throw new InvalidOrderStateError(id, 'verified', orderRow.status);
      }

      for (const line of orderRow.lines) {
        // Release BEFORE sale_out — load-bearing ordering (design.md
        // decision #4): keeps every intermediate statement's `reserved <=
        // on_hand` invariant clean. The IMMEDIATE DB CHECK of the same name
        // (W4 migration) enforces this — reversing these two calls drives the
        // intermediate row to `on_hand < reserved` and rolls the tx back
        // (locked by the zero-margin deliver test).
        await applyReservationTx(
          tx,
          { productId: line.productId, warehouseId: orderRow.warehouseId, quantity: line.quantity },
          'release',
        );
        await applyStockMovementTx(tx, {
          productId: line.productId,
          warehouseId: orderRow.warehouseId,
          type: 'sale_out',
          quantity: line.quantity,
        });
      }

      // Direction B of the two-way Sales<->Delivery relationship
      // (design.md §2B, delivery-assignment-seam.md) — a TRANSACTION, not
      // Commission's try/catch (ADR-2): an assignment left `in_transit`
      // behind a `delivered` order is not an independently-recoverable fact
      // like commission, it is a stale PROJECTION of this same event that
      // would poison every capacity read forever. If ANYTHING here or below
      // fails, this call (already uncommitted) unwinds with everything else
      // — order stays `verified`, stock untouched, assignment still
      // `in_transit`.
      //
      // Runs AFTER the per-line stock loop — matching design §10's diagram.
      // Note it is not the LAST statement of the transaction: the `status`
      // update and the full re-read below still follow it. The tradeoff is
      // LOCK HOLD TIME: this guarded UPDATE takes an exclusive row lock on
      // the assignment and holds it until COMMIT, so running it before the
      // loop would keep that lock across every
      // `applyReservationTx`/`applyStockMovementTx` — the longest possible
      // hold, growing with the order's line count. Atomicity is identical
      // either way; statement order inside one transaction cannot change an
      // all-or-nothing outcome.
      //
      // 0 rows affected is the NORMAL case (pickup orders, or an
      // already-closed assignment) — never an error, never
      // `findUniqueOrThrow` (see the helper's own doc comment).
      await closeAssignmentOnDeliveryTx(tx, id);

      await tx.order.update({ where: { id }, data: { status: 'delivered', deliveredAt: new Date() } });

      return tx.order.findUniqueOrThrow({ where: { id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }

  async cancel(id: string): Promise<DomainOrder> {
    const row = await this.lockedTransaction('PrismaOrderRepository.cancel', async (tx) => {
      // FIRST statement of the transaction — see `lockOrderRowTx`.
      await lockOrderRowTx(tx, id);
      const orderRow = await tx.order.findUniqueOrThrow({ where: { id }, include: TRANSITION_LINES_INCLUDE });
      if (orderRow.status !== 'created' && orderRow.status !== 'verified') {
        throw new InvalidOrderStateError(id, 'created|verified', orderRow.status);
      }

      if (orderRow.status === 'verified') {
        for (const line of orderRow.lines) {
          await applyReservationTx(
            tx,
            { productId: line.productId, warehouseId: orderRow.warehouseId, quantity: line.quantity },
            'release',
          );
        }
      }

      // The cancellation counterpart of `closeAssignmentOnDeliveryTx` above,
      // same reasoning and same placement (after the stock loop, minimal
      // assignment-lock hold; the order `status` update still follows). The
      // order row itself was locked at the top of this transaction
      // (`lockOrderRowTx`), which is what stops a concurrent
      // `POST /delivery/assignments` from inserting a fresh `in_transit` row
      // behind this cancellation. Without
      // it, cancelling an ASSIGNED order stranded its assignment in
      // `in_transit` forever: the carrier read BUSY in every capacity
      // snapshot and no API path could ever close the row, because
      // `markDelivered` on a cancelled order throws `InvalidOrderStateError`.
      // Recovery needed manual SQL. 0 rows affected is the NORMAL case
      // (pickup orders, unassigned delivery orders).
      await cancelAssignmentOnOrderCancelTx(tx, id);

      await tx.order.update({ where: { id }, data: { status: 'cancelled' } });

      return tx.order.findUniqueOrThrow({ where: { id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }
}
