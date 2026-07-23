import { Injectable } from '@nestjs/common';
import type {
  CreateOrderInput,
  Currency,
  DeliveryMode,
  IOrderRepository,
  Order as DomainOrder,
  OrderLine as DomainOrderLine,
  OrderListFilter,
  OrderPayment as DomainOrderPayment,
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
import { PrismaService } from '../prisma-client.js';
import { applyReservationTx } from '../inventory/apply-reservation.js';
import { applyStockMovementTx } from '../inventory/apply-stock-movement.js';

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
  readonly subtotal: { toString(): string };
  readonly discountTotal: { toString(): string };
  readonly total: { toString(): string };
  readonly orderDate: Date;
  readonly verifiedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly OrderLineRow[];
  readonly payments: readonly OrderPaymentRow[];
  readonly saleCredit: SaleCreditRow | null;
}

/** Prisma's `include` shape shared by every full-aggregate read. */
const AGGREGATE_INCLUDE = { lines: true, payments: true, saleCredit: true } as const;

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
    orderDate: row.orderDate,
    active: row.active,
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
 * resulting fully-validated `Order` is what actually arrives here, even
 * though the port's static type is the looser `CreateOrderInput` (an
 * `Order` structurally satisfies it — TS elides the extra computed fields on
 * a non-literal argument). This repository never recomputes currency,
 * totals, or per-line/payment conversions — it persists exactly what it is
 * given and reconstructs the identical shape on every read (`findById`
 * never re-resolves rates, `verificado` snapshots stay read-only, see
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
 * earlier per-line mutation in the same call.
 */
@Injectable()
export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderInput): Promise<DomainOrder> {
    // See class doc — `input` is expected to already be a factory-built
    // `Order` (currency/status/totals/per-line+payment conversions already
    // computed); the cast below is the adapter-boundary acknowledgment of
    // that contract, not a domain change.
    const order = input as unknown as DomainOrder;

    const row = await this.prisma.$transaction(async (tx) => {
      const orderRow = await tx.order.create({
        data: {
          id: order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          warehouseId: order.warehouseId,
          deliveryMode: order.deliveryMode,
          currency: order.currency,
          status: order.status,
          subtotal: moneyToDecimalString(order.subtotal),
          discountTotal: moneyToDecimalString(order.discountTotal),
          total: moneyToDecimalString(order.total),
          orderDate: order.orderDate,
          verifiedAt: order.verifiedAt,
          deliveredAt: order.deliveredAt,
          active: order.active,
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
    const row = await this.prisma.order.update({
      where: { id },
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
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
      include: AGGREGATE_INCLUDE,
    });
    return orderToDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { active: false } });
  }

  async findById(id: string): Promise<DomainOrder | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: AGGREGATE_INCLUDE });
    return row ? orderToDomain(row) : null;
  }

  async list(filter?: OrderListFilter): Promise<DomainOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        ...(filter?.includeInactive ? {} : { active: true }),
        ...(filter?.customerId ? { customerId: filter.customerId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: AGGREGATE_INCLUDE,
      orderBy: { orderDate: 'desc' },
    });
    return rows.map(orderToDomain);
  }

  async confirm(id: string): Promise<DomainOrder> {
    const row = await this.prisma.$transaction(async (tx) => {
      const orderRow = await tx.order.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (orderRow.status !== 'creado') {
        throw new InvalidOrderStateError(id, 'creado', orderRow.status);
      }

      for (const line of orderRow.lines) {
        await applyReservationTx(
          tx,
          { productId: line.productId, warehouseId: orderRow.warehouseId, quantity: line.quantity },
          'reserve',
        );
      }

      await tx.order.update({ where: { id }, data: { status: 'verificado', verifiedAt: new Date() } });

      return tx.order.findUniqueOrThrow({ where: { id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }

  async deliver(id: string): Promise<DomainOrder> {
    const row = await this.prisma.$transaction(async (tx) => {
      const orderRow = await tx.order.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (orderRow.status !== 'verificado') {
        throw new InvalidOrderStateError(id, 'verificado', orderRow.status);
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

      await tx.order.update({ where: { id }, data: { status: 'entregado', deliveredAt: new Date() } });

      return tx.order.findUniqueOrThrow({ where: { id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }

  async cancel(id: string): Promise<DomainOrder> {
    const row = await this.prisma.$transaction(async (tx) => {
      const orderRow = await tx.order.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      if (orderRow.status !== 'creado' && orderRow.status !== 'verificado') {
        throw new InvalidOrderStateError(id, 'creado|verificado', orderRow.status);
      }

      if (orderRow.status === 'verificado') {
        for (const line of orderRow.lines) {
          await applyReservationTx(
            tx,
            { productId: line.productId, warehouseId: orderRow.warehouseId, quantity: line.quantity },
            'release',
          );
        }
      }

      await tx.order.update({ where: { id }, data: { status: 'cancelado' } });

      return tx.order.findUniqueOrThrow({ where: { id }, include: AGGREGATE_INCLUDE });
    });

    return orderToDomain(row);
  }
}
