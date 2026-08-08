import { describe, it, expect } from 'vitest';
import { createCarrierWarehouse } from './carrier-warehouse.js';

describe('createCarrierWarehouse', () => {
  it('pairs a carrierId and warehouseId', () => {
    const cw = createCarrierWarehouse({ carrierId: 'carrier-1', warehouseId: 'wh-1' });
    expect(cw.carrierId).toBe('carrier-1');
    expect(cw.warehouseId).toBe('wh-1');
  });

  it('mints a fresh id and createdAt when not supplied', () => {
    const cw = createCarrierWarehouse({ carrierId: 'carrier-1', warehouseId: 'wh-1' });
    expect(cw.id).toEqual(expect.any(String));
    expect(cw.createdAt).toBeInstanceOf(Date);
  });

  /**
   * Structural assertion pinning D2: the join table exists precisely so
   * coverage never grows a `zone`/geography dimension. No production
   * validation is needed to prove this — the TYPE itself has no such field.
   */
  it('has no zone field anywhere (D2)', () => {
    const cw = createCarrierWarehouse({ carrierId: 'carrier-1', warehouseId: 'wh-1' });
    expect(Object.keys(cw)).not.toContain('zone');
  });

  it('pairs a different carrier/warehouse combination independently', () => {
    const first = createCarrierWarehouse({ carrierId: 'carrier-1', warehouseId: 'wh-1' });
    const second = createCarrierWarehouse({ carrierId: 'carrier-2', warehouseId: 'wh-2' });
    expect(first.carrierId).not.toBe(second.carrierId);
    expect(first.warehouseId).not.toBe(second.warehouseId);
    expect(first.id).not.toBe(second.id);
  });
});
