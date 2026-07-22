import { randomUUID } from 'node:crypto';
import type { Currency, Money } from '../currency/money.js';
import { addMoney, money } from '../currency/money.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';
import { convertirEntreMonedas } from '../currency/rate-resolver.js';
import type { OrderLine, BuildOrderLineInput } from './order-line.js';
import { buildOrderLine } from './order-line.js';
import type { OrderPayment, BuildOrderPaymentInput } from './order-payment.js';
import { buildOrderPayment } from './order-payment.js';
import type { SaleCredit } from './sale-credit.js';
import { InvalidOrderError, InvalidOrderStateError } from './errors.js';

/**
 * `Order` fulfillment path. This slice (Ventas) implements only the
 * `recogida` direct edge (`verificado -> entregado`); `domicilio` continues
 * through a FUTURE Delivery module out of scope here — Ventas never models
 * `despachando`/`transportando`.
 */
export type DeliveryMode = 'recogida' | 'domicilio';

/** Exactly 4 states — `entregado` is TERMINAL, no outgoing transition. */
export type OrderStatus = 'creado' | 'verificado' | 'entregado' | 'cancelado';

const VALID_DELIVERY_MODES: readonly DeliveryMode[] = ['recogida', 'domicilio'];

/**
 * `Order` aggregate root — owns `OrderLine[]` + `OrderPayment[]` + an
 * optional `SaleCredit`. `currency` is DERIVED (never selected): any line
 * priced in USD forces `USD`, otherwise `MN` (EUR never becomes the order
 * currency). `subtotal`/`discountTotal`/`total` are always recomputed from
 * `lines`, never accepted as stored input.
 */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly deliveryMode: DeliveryMode;
  readonly currency: Currency;
  readonly status: OrderStatus;
  readonly subtotal: Money;
  readonly discountTotal: Money;
  readonly total: Money;
  readonly lines: readonly OrderLine[];
  readonly payments: readonly OrderPayment[];
  readonly saleCredit: SaleCredit | null;
  readonly orderDate: Date;
  readonly active: boolean;
  readonly verifiedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createOrder`. `id`/`createdAt`/`updatedAt` are optional so the
 * factory can mint a brand-new order. `total`, if supplied, is IGNORED —
 * `Order.total` is always recomputed from `lines` (spec: "Totals are
 * derived, not accepted as input").
 */
export interface CreateOrderInput {
  readonly id?: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly deliveryMode: DeliveryMode;
  readonly lines: readonly BuildOrderLineInput[];
  readonly payments?: readonly BuildOrderPaymentInput[];
  readonly saleCredit?: SaleCredit | null;
  readonly total?: Money;
  readonly orderDate?: Date;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs the WHOLE `Order` aggregate in memory —
 * `IOrderRepository` is a dumb persister, never a second source of
 * invariants. Enforces (throwing `InvalidOrderError`, "grita, no adivina"):
 * at least one line; a valid `deliveryMode`; the payment-sum invariant
 * (`Σ amountInOrderCurrency === total`). Cross-currency conversion with no
 * resolvable rate propagates `RateNotFoundError` from `buildOrderLine`/
 * `buildOrderPayment` unchanged — the factory STOPS immediately, no partial
 * aggregate is ever returned (nothing is assigned/returned before every
 * line and payment has been built successfully).
 */
export function createOrder(input: CreateOrderInput, rates: ExchangeRate[], at: Date): Order {
  if (!input.lines || input.lines.length === 0) {
    throw new InvalidOrderError('Order requires at least one OrderLine');
  }
  if (!input.deliveryMode || !VALID_DELIVERY_MODES.includes(input.deliveryMode)) {
    throw new InvalidOrderError(
      `Order deliveryMode must be one of ${VALID_DELIVERY_MODES.join('|')}, got "${String(input.deliveryMode)}"`,
    );
  }

  const currency: Currency = input.lines.some((line) => line.price.currency === 'USD')
    ? 'USD'
    : 'MN';

  const lines = input.lines.map((line) => buildOrderLine(line, currency, rates, at));
  const payments = (input.payments ?? []).map((payment) =>
    buildOrderPayment(payment, currency, rates, at),
  );

  const total = lines.reduce(
    (acc, line) => addMoney(acc, line.lineTotalOrder),
    money(0n, currency),
  );

  // discountTotal: the pre-discount (gross) native amount minus the
  // post-discount lineTotalNative, converted into the order currency via the
  // same channel-less conversion `buildOrderLine` uses. subtotal is derived
  // as total + discountTotal (never stored/accepted as input either).
  const discountTotal = lines.reduce((acc, line) => {
    const grossNativeUnits = line.price.minorUnits * BigInt(line.quantity);
    const discountNativeUnits = grossNativeUnits - line.lineTotalNative.minorUnits;
    if (discountNativeUnits === 0n) return acc;
    const discountNative: Money = { minorUnits: discountNativeUnits, currency: line.price.currency };
    const { money: discountOrder } = convertirEntreMonedas(rates, discountNative, currency, at);
    return addMoney(acc, discountOrder);
  }, money(0n, currency));
  const subtotal = addMoney(total, discountTotal);

  // Payment-sum invariant, enforced by the factory (spec: "Invariants
  // Enforced via Named Errors and Factory"). NOTE (deviation flagged, see
  // apply-progress): checked unconditionally, including payments=[] — a
  // pure credit sale (SaleCredit only, no upfront payment) would need
  // total=0 to pass today. No RED test in this Phase 3 slice exercises a
  // credit-only order, so the exemption is deferred rather than invented
  // untested.
  const paymentSum = payments.reduce(
    (acc, payment) => addMoney(acc, payment.amountInOrderCurrency),
    money(0n, currency),
  );
  if (paymentSum.minorUnits !== total.minorUnits) {
    throw new InvalidOrderError(
      `OrderPayment sum (${paymentSum.minorUnits} ${paymentSum.currency}) must equal Order.total (${total.minorUnits} ${total.currency})`,
    );
  }

  return {
    id: input.id ?? randomUUID(),
    customerId: input.customerId,
    customerName: input.customerName,
    warehouseId: input.warehouseId,
    deliveryMode: input.deliveryMode,
    currency,
    status: 'creado',
    subtotal,
    discountTotal,
    total,
    lines,
    payments,
    saleCredit: input.saleCredit ?? null,
    orderDate: input.orderDate ?? at,
    active: input.active ?? true,
    verifiedAt: null,
    deliveredAt: null,
    createdAt: input.createdAt ?? at,
    updatedAt: input.updatedAt ?? at,
  };
}

/**
 * Pure guard: `creado -> verificado`. Freezes rate + totals (already frozen
 * at line/payment build time inside `createOrder`) and stamps `verifiedAt`.
 * Rejects any other source status with `InvalidOrderStateError` — this
 * includes double-verify (`verificado -> verificado`).
 */
export function confirmOrder(order: Order, at: Date): Order {
  if (order.status !== 'creado') {
    throw new InvalidOrderStateError(order.id, 'creado', order.status);
  }
  return { ...order, status: 'verificado', verifiedAt: at, updatedAt: at };
}

/**
 * Pure guard: `verificado -> entregado`, the ONLY delivery edge Ventas
 * models this slice regardless of `deliveryMode` (see `DeliveryMode`).
 * Rejects any other source status with `InvalidOrderStateError`.
 */
export function deliverOrder(order: Order, at: Date): Order {
  if (order.status !== 'verificado') {
    throw new InvalidOrderStateError(order.id, 'verificado', order.status);
  }
  return { ...order, status: 'entregado', deliveredAt: at, updatedAt: at };
}

/**
 * Pure guard: `cancelado` is reachable ONLY from `creado` or `verificado`.
 * `entregado` is TERMINAL — cancelling an already-delivered order (a
 * "devolución") is out of scope this slice and rejected with
 * `InvalidOrderStateError`, same as any other post-`entregado` transition.
 */
export function cancelOrder(order: Order, at: Date): Order {
  if (order.status !== 'creado' && order.status !== 'verificado') {
    throw new InvalidOrderStateError(order.id, 'creado|verificado', order.status);
  }
  return { ...order, status: 'cancelado', updatedAt: at };
}
