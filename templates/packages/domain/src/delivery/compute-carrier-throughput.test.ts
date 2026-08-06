import { describe, it, expect } from 'vitest';
import { computeCarrierThroughput } from './compute-carrier-throughput.js';
import { assignCarrier, markAssignmentDelivered } from './delivery-assignment.js';
import type { DeliveryAssignment } from './delivery-assignment.js';

const AT = new Date('2026-08-01T00:00:00.000Z');

function delivered(carrierId: string, orderId: string, deliveredAt: Date): DeliveryAssignment {
  return markAssignmentDelivered(assignCarrier({ orderId, carrierId }, AT), deliveredAt);
}

describe('computeCarrierThroughput', () => {
  it('counts delivered assignments per carrier, all-time by default', () => {
    const result = computeCarrierThroughput([
      delivered('carrier-1', 'order-1', new Date('2026-08-02T00:00:00.000Z')),
      delivered('carrier-1', 'order-2', new Date('2026-08-03T00:00:00.000Z')),
      delivered('carrier-2', 'order-3', new Date('2026-08-03T00:00:00.000Z')),
    ]);

    expect(result.get('carrier-1')).toBe(2);
    expect(result.get('carrier-2')).toBe(1);
  });

  it('excludes in_transit assignments from the count', () => {
    const open = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    const done = delivered('carrier-1', 'order-2', new Date('2026-08-03T00:00:00.000Z'));

    const result = computeCarrierThroughput([open, done]);

    expect(result.get('carrier-1')).toBe(1);
  });

  it('filters by an optional [from,to] window', () => {
    const result = computeCarrierThroughput(
      [
        delivered('carrier-1', 'order-1', new Date('2026-07-01T00:00:00.000Z')),
        delivered('carrier-1', 'order-2', new Date('2026-08-15T00:00:00.000Z')),
      ],
      { from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-31T00:00:00.000Z') },
    );

    expect(result.get('carrier-1')).toBe(1);
  });

  it('returns an empty map when nothing is delivered', () => {
    const open = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    const result = computeCarrierThroughput([open]);
    expect(result.size).toBe(0);
  });
});
