import { describe, it, expect } from 'vitest';
import { createWarehouseOperator } from './warehouse-operator.js';

describe('WarehouseOperator — shape', () => {
  it('carries userId (PK/FK) and warehouseId', () => {
    const detail = createWarehouseOperator({ userId: 'user-1', warehouseId: 'wh-1' });
    expect(detail.userId).toBe('user-1');
    expect(detail.warehouseId).toBe('wh-1');
  });

  it('two operators may share the same warehouseId — NOT unique', () => {
    const a = createWarehouseOperator({ userId: 'user-1', warehouseId: 'wh-1' });
    const b = createWarehouseOperator({ userId: 'user-2', warehouseId: 'wh-1' });
    expect(a.warehouseId).toBe(b.warehouseId);
    expect(a.userId).not.toBe(b.userId);
  });
});
