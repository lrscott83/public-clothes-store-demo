import { describe, it, expect } from 'vitest';
import {
  DELIVERY_MODE_LABELS_ES,
  ORDER_STATUS_LABELS_ES,
  OrderLabelHelpers,
} from './labels.js';
import type { DeliveryMode, OrderStatus } from './order.js';

describe('ORDER_STATUS_LABELS_ES / OrderLabelHelpers.getOrderStatusLabel', () => {
  it('covers every OrderStatus with the neutral LatAm Spanish label (owner-approved)', () => {
    expect(ORDER_STATUS_LABELS_ES.created).toBe('Creado');
    expect(ORDER_STATUS_LABELS_ES.verified).toBe('Verificado');
    expect(ORDER_STATUS_LABELS_ES.delivered).toBe('Entregado');
    expect(ORDER_STATUS_LABELS_ES.cancelled).toBe('Cancelado');
  });

  it('getOrderStatusLabel looks up the same map', () => {
    expect(OrderLabelHelpers.getOrderStatusLabel('created')).toBe('Creado');
    expect(OrderLabelHelpers.getOrderStatusLabel('verified')).toBe('Verificado');
    expect(OrderLabelHelpers.getOrderStatusLabel('delivered')).toBe('Entregado');
    expect(OrderLabelHelpers.getOrderStatusLabel('cancelled')).toBe('Cancelado');
  });

  it('an unrecognized status is a compile-time type error, never a runtime default', () => {
    // @ts-expect-error 'shipped' is not a member of OrderStatus — tsc must reject
    // this, proving unknown statuses can never silently resolve to a default value.
    const invalid: OrderStatus = 'shipped';
    expect(invalid).toBe('shipped');
  });
});

describe('DELIVERY_MODE_LABELS_ES / OrderLabelHelpers.getDeliveryModeLabel', () => {
  it('covers every DeliveryMode with the neutral LatAm Spanish label (owner-approved)', () => {
    expect(DELIVERY_MODE_LABELS_ES.pickup).toBe('Recogida en tienda');
    expect(DELIVERY_MODE_LABELS_ES.delivery).toBe('Envío a domicilio');
  });

  it('getDeliveryModeLabel looks up the same map', () => {
    expect(OrderLabelHelpers.getDeliveryModeLabel('pickup')).toBe('Recogida en tienda');
    expect(OrderLabelHelpers.getDeliveryModeLabel('delivery')).toBe('Envío a domicilio');
  });

  it('an unrecognized delivery mode is a compile-time type error, never a runtime default', () => {
    // @ts-expect-error 'courier' is not a member of DeliveryMode — tsc must reject
    // this, proving unknown modes can never silently resolve to a default value.
    const invalid: DeliveryMode = 'courier';
    expect(invalid).toBe('courier');
  });
});
