import type { DeliveryMode, OrderStatus } from '../sales/order.js';

/**
 * The only `Order` facts Delivery needs in order to decide whether an
 * assignment may exist for it, and who is allowed to act on it.
 *
 * Deliberately NOT the Sales `Order` entity: loading the full aggregate
 * (lines, payments, credit) to read three scalars is a wasted read, and it
 * would force this port — declared by DELIVERY — to depend on Sales' root
 * entity. `DeliveryMode`/`OrderStatus` are reused rather than re-declared so
 * the valid values have exactly one home and cannot drift.
 *
 * The "wasted read" clause is now BACKED: the adapter serves this from
 * `IOrderRepository.findScopeProjection`, a four-column SELECT with no
 * joins. It used to be served from `OrderService.findById`, which loads
 * exactly the aggregate this comment says it avoids — the claim was true of
 * the TYPE and false of the implementation, on the hot path of every
 * `assign`.
 *
 * `OrderService`'s own `update`/`confirm`/`deliver`/`cancel` now use the same
 * projection for their existence pre-checks. Each loaded the FULL aggregate —
 * lines, payments, sale credit — purely to decide whether to return `null`,
 * immediately before a transaction that re-reads and re-checks everything
 * under a row lock anyway. So the claim above was only half true when it was
 * written: this port's read had been narrowed, and the far more frequent
 * pre-checks next door had not.
 */
export interface OrderDeliverySnapshot {
  readonly orderId: string;
  /** The scope a `warehouse_operator` must match to act on this order. */
  readonly warehouseId: string;
  readonly deliveryMode: DeliveryMode;
  readonly status: OrderStatus;
}

/**
 * Declared by DELIVERY because Delivery is the one that NEEDS the transition —
 * dependency inversion, mirroring `ICommissionAccrualRecorder`. Sales remains
 * the sole owner of `Order.status` (D6); this port only asks.
 */
export interface IOrderDeliveryGateway {
  /**
   * `null` when no such order exists — not an error at this layer; the caller
   * decides what a missing order means for its own operation.
   */
  findOrderSnapshot(orderId: string): Promise<OrderDeliverySnapshot | null>;
  /**
   * `verified -> delivered` via Sales' existing path (commission accrual
   * included). Returns nothing: every caller discards the result, and
   * materializing an `Order` just to satisfy a return type costs a second
   * full aggregate read for data nobody reads.
   */
  markOrderDelivered(orderId: string): Promise<void>;
}

/** DI token for `IOrderDeliveryGateway` — consumers inject by this symbol. */
export const ORDER_DELIVERY_GATEWAY = Symbol('IOrderDeliveryGateway');
