import { describe, it, expect } from 'vitest';
import { assignCarrier, markAssignmentDelivered } from './delivery-assignment.js';
import { InvalidAssignmentStateError } from './errors.js';

const AT = new Date('2026-08-06T12:00:00.000Z');
const LATER = new Date('2026-08-07T09:30:00.000Z');

describe('assignCarrier', () => {
  it('sets carrier, status=in_transit and assignedAt in one atomic call', () => {
    const assignment = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    expect(assignment.orderId).toBe('order-1');
    expect(assignment.carrierId).toBe('carrier-1');
    expect(assignment.status).toBe('in_transit');
    expect(assignment.assignedAt).toEqual(AT);
    expect(assignment.deliveredAt).toBeNull();
  });

  it('mints a fresh id when not supplied', () => {
    const a1 = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    const a2 = assignCarrier({ orderId: 'order-2', carrierId: 'carrier-1' }, AT);
    expect(a1.id).not.toBe(a2.id);
  });
});

describe('markAssignmentDelivered', () => {
  it('transitions in_transit -> delivered, stamping deliveredAt', () => {
    const assignment = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    const delivered = markAssignmentDelivered(assignment, LATER);
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).toEqual(LATER);
    expect(delivered.updatedAt).toEqual(LATER);
    // identity preserved
    expect(delivered.id).toBe(assignment.id);
    expect(delivered.orderId).toBe(assignment.orderId);
    expect(delivered.carrierId).toBe(assignment.carrierId);
  });

  it('rejects an already-delivered assignment with InvalidAssignmentStateError', () => {
    const assignment = assignCarrier({ orderId: 'order-1', carrierId: 'carrier-1' }, AT);
    const delivered = markAssignmentDelivered(assignment, LATER);
    expect(() => markAssignmentDelivered(delivered, new Date('2026-08-08T00:00:00.000Z'))).toThrow(
      InvalidAssignmentStateError,
    );
  });
});
