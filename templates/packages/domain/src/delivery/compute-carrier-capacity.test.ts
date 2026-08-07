import { describe, it, expect } from 'vitest';
import { computeCarrierCapacity } from './compute-carrier-capacity.js';
import { createCarrier } from './carrier.js';
import { assignCarrier, markAssignmentDelivered } from './delivery-assignment.js';
import type { DeliveryAssignment } from './delivery-assignment.js';

const AT = new Date('2026-08-06T12:00:00.000Z');
const LATER = new Date('2026-08-07T09:00:00.000Z');

describe('computeCarrierCapacity', () => {
  it('reports a carrier with >=1 in_transit assignment as busy', () => {
    const carrier = createCarrier({ id: 'carrier-1', name: 'Transportes ABC' });
    const assignment = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);

    const capacity = computeCarrierCapacity([carrier], [assignment]);

    expect(capacity.carriers).toHaveLength(1);
    expect(capacity.carriers[0]!.busy).toBe(true);
    expect(capacity.carriers[0]!.inTransitCount).toBe(1);
    expect(capacity.busyCount).toBe(1);
    expect(capacity.freeCount).toBe(0);
  });

  it('reports a carrier with zero assignments as free', () => {
    const carrier = createCarrier({ id: 'carrier-1', name: 'Transportes ABC' });

    const capacity = computeCarrierCapacity([carrier], []);

    expect(capacity.carriers[0]!.busy).toBe(false);
    expect(capacity.carriers[0]!.inTransitCount).toBe(0);
    expect(capacity.freeCount).toBe(1);
    expect(capacity.busyCount).toBe(0);
  });

  it('reports a carrier with only delivered assignments as free', () => {
    const carrier = createCarrier({ id: 'carrier-1', name: 'Transportes ABC' });
    const assignment = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    const delivered = markAssignmentDelivered(assignment, LATER);

    const capacity = computeCarrierCapacity([carrier], [delivered]);

    expect(capacity.carriers[0]!.busy).toBe(false);
    expect(capacity.carriers[0]!.inTransitCount).toBe(0);
  });

  it('reports a carrier with only cancelled assignments as free — a cancelled order never keeps a carrier busy', () => {
    const carrier = createCarrier({ id: 'carrier-1', name: 'Transportes ABC' });
    const cancelled: DeliveryAssignment = {
      ...assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT),
      status: 'cancelled',
    };

    const capacity = computeCarrierCapacity([carrier], [cancelled]);

    expect(capacity.carriers[0]!.busy).toBe(false);
    expect(capacity.carriers[0]!.inTransitCount).toBe(0);
    expect(capacity.freeCount).toBe(1);
  });

  it('computes busyCount/freeCount totals correctly across a mixed list', () => {
    const carrierA = createCarrier({ id: 'carrier-a', name: 'Transportes A' });
    const carrierB = createCarrier({ id: 'carrier-b', name: 'Transportes B' });
    const carrierC = createCarrier({ id: 'carrier-c', name: 'Transportes C' });

    const openForA = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-a' }, AT);
    const openForB1 = assignCarrier({ orderId: 'order-2', carrierId: 'carrier-b' }, AT);
    const openForB2 = assignCarrier({ orderId: 'order-3', carrierId: 'carrier-b' }, AT);
    const deliveredForC = markAssignmentDelivered(
      assignCarrier({ orderId: 'order-4', carrierId: 'carrier-c' }, AT),
      LATER,
    );

    const capacity = computeCarrierCapacity(
      [carrierA, carrierB, carrierC],
      [openForA, openForB1, openForB2, deliveredForC],
    );

    expect(capacity.busyCount).toBe(2);
    expect(capacity.freeCount).toBe(1);
    const byId = new Map(capacity.carriers.map((c) => [c.carrierId, c]));
    expect(byId.get('carrier-a')!.inTransitCount).toBe(1);
    expect(byId.get('carrier-b')!.inTransitCount).toBe(2);
    expect(byId.get('carrier-c')!.inTransitCount).toBe(0);
    expect(byId.get('carrier-c')!.busy).toBe(false);
  });
});
