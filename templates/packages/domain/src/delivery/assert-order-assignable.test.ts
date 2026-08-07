import { describe, expect, it } from 'vitest';
import {
  CarrierNotFoundError,
  OrderNotAssignableStateError,
  OrderNotFoundForDeliveryError,
  PickupOrderCannotBeAssignedError,
} from './errors.js';
import { assertOrderAssignable } from './assert-order-assignable.js';

/**
 * The four rules that decide whether an assignment may exist for an order
 * were stated TWICE — once in `DeliveryService.assign` and again in
 * `PrismaDeliveryAssignmentRepository.create`'s locked re-read. A future rule
 * change had to be made in two unrelated files, in two different layers, or
 * they diverged silently; and the adapter re-deciding fulfilment policy is
 * the exact inversion `architecture.md` forbids ("pure business logic in
 * packages; infrastructure enters through ports").
 *
 * The lock and the locked re-read stay where they are — only the DECISION
 * moved here.
 */
describe('assertOrderAssignable', () => {
  const ORDER_ID = 'order-1';
  const CARRIER_ID = 'carrier-1';
  const activeCarrier = { active: true };
  const verifiedDelivery = { deliveryMode: 'delivery', status: 'verified' } as const;

  it('passes for a verified delivery order and an active carrier', () => {
    expect(() =>
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: verifiedDelivery,
        carrier: activeCarrier,
      }),
    ).not.toThrow();
  });

  it('rejects a missing order', () => {
    expect(() =>
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: null,
        carrier: activeCarrier,
      }),
    ).toThrow(OrderNotFoundForDeliveryError);
  });

  it('rejects a pickup order — an assignment for one must NEVER exist', () => {
    expect(() =>
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: { deliveryMode: 'pickup', status: 'verified' },
        carrier: activeCarrier,
      }),
    ).toThrow(PickupOrderCannotBeAssignedError);
  });

  it.each(['created', 'delivered', 'cancelled'] as const)(
    'rejects a %s order — the assignment would be unclosable',
    (status) => {
      expect(() =>
        assertOrderAssignable({
          orderId: ORDER_ID,
          carrierId: CARRIER_ID,
          order: { deliveryMode: 'delivery', status },
          carrier: activeCarrier,
        }),
      ).toThrow(OrderNotAssignableStateError);
    },
  );

  /**
   * The status rule used to throw Sales' `InvalidOrderStateError`, which put a
   * Sales error class on Delivery's import list in the same round that
   * reshaped `order-delivery-gateway.port.ts` specifically to stop Delivery
   * depending on Sales' `Order` root. Asserted here so the dependency cannot
   * come back quietly: this file imports NOTHING from `../sales/errors.js`,
   * and the error it gets is Delivery's own.
   */
  it('throws only DELIVERY errors — no Sales error class crosses the module boundary', () => {
    let thrown: unknown;
    try {
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: { deliveryMode: 'delivery', status: 'created' },
        carrier: activeCarrier,
      });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).name).toBe('OrderNotAssignableStateError');
    // Same 409 class and the same three fields as `InvalidOrderStateError`:
    // the observable HTTP contract did not change, only ownership did.
    expect(thrown).toMatchObject({ orderId: ORDER_ID, expected: 'verified', actual: 'created' });
  });

  it('rejects an unknown carrier and an INACTIVE one identically', () => {
    expect(() =>
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: verifiedDelivery,
        carrier: null,
      }),
    ).toThrow(CarrierNotFoundError);
    expect(() =>
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: verifiedDelivery,
        carrier: { active: false },
      }),
    ).toThrow(CarrierNotFoundError);
  });

  /**
   * The ORDER of the checks is part of the contract, not an accident. The
   * caller asserts the warehouse scope between "the order exists" and
   * everything else, so a rule that ran earlier would answer an out-of-scope
   * operator with a fact about an order they may not see.
   */
  it('reports the missing ORDER first when the carrier is also unusable', () => {
    expect(() =>
      assertOrderAssignable({
        orderId: ORDER_ID,
        carrierId: CARRIER_ID,
        order: null,
        carrier: null,
      }),
    ).toThrow(OrderNotFoundForDeliveryError);
  });
});
