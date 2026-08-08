import { describe, it, expect } from 'vitest';
import { createWarehouseOperator } from './warehouse-operator.js';

describe('WarehouseOperator — shape', () => {
  it('carries companyUserId (PK/FK) and warehouseId', () => {
    const detail = createWarehouseOperator({ companyUserId: 'company-user-1', warehouseId: 'wh-1' });
    expect(detail.companyUserId).toBe('company-user-1');
    expect(detail.warehouseId).toBe('wh-1');
  });

  it('two operators may share the same warehouseId — NOT unique', () => {
    const a = createWarehouseOperator({ companyUserId: 'company-user-1', warehouseId: 'wh-1' });
    const b = createWarehouseOperator({ companyUserId: 'company-user-2', warehouseId: 'wh-1' });
    expect(a.warehouseId).toBe(b.warehouseId);
    expect(a.companyUserId).not.toBe(b.companyUserId);
  });
});
