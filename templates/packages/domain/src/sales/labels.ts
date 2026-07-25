import type { DeliveryMode, OrderStatus } from './order.js';

/**
 * Spanish, UI-facing display labels for each `OrderStatus` KEY. Keys stay in
 * English (code/DB identifiers); only the human-readable label is Spanish.
 * `Record<OrderStatus, string>` is deliberate: adding a new `OrderStatus`
 * value is a compile error here until its label is added — mirrors the
 * `ROLE_LABELS_ES` convention in `../users/roles.js`.
 */
export const ORDER_STATUS_LABELS_ES: Record<OrderStatus, string> = {
  created: 'Creado',
  verified: 'Verificado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/**
 * Spanish, UI-facing display labels for each `DeliveryMode` KEY. Same
 * exhaustiveness guarantee as `ORDER_STATUS_LABELS_ES` above.
 */
export const DELIVERY_MODE_LABELS_ES: Record<DeliveryMode, string> = {
  pickup: 'Recogida en tienda',
  delivery: 'Envío a domicilio',
};

export const OrderLabelHelpers = {
  /** Spanish display label for an order status — UI-facing only, never a stored/matched key. */
  getOrderStatusLabel: (status: OrderStatus): string => ORDER_STATUS_LABELS_ES[status],

  /** Spanish display label for a delivery mode — UI-facing only, never a stored/matched key. */
  getDeliveryModeLabel: (mode: DeliveryMode): string => DELIVERY_MODE_LABELS_ES[mode],
};
