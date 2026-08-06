import type { Order } from '../sales/order.js';

/**
 * Declared by DELIVERY because Delivery is the one that NEEDS the transition —
 * dependency inversion, mirroring `ICommissionAccrualRecorder`. Sales remains
 * the sole owner of `Order.status` (D6); this port only asks.
 */
export interface IOrderDeliveryGateway {
  /** `verified -> delivered` via Sales' existing path (commission accrual included). */
  markOrderDelivered(orderId: string): Promise<Order>;
}

/** DI token for `IOrderDeliveryGateway` — consumers inject by this symbol. */
export const ORDER_DELIVERY_GATEWAY = Symbol('IOrderDeliveryGateway');
