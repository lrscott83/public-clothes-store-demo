import { describe, it, expect } from 'vitest';
import { createWarehouse } from './warehouse.js';
import { InvalidWarehouseError } from './errors.js';

describe('createWarehouse — invariants', () => {
  it('rejects an empty name', () => {
    expect(() => createWarehouse({ name: '' })).toThrow(InvalidWarehouseError);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => createWarehouse({ name: '   ' })).toThrow(InvalidWarehouseError);
  });

  it('accepts a valid name and defaults active=true', () => {
    const warehouse = createWarehouse({ name: 'Pinar del Río' });
    expect(warehouse.name).toBe('Pinar del Río');
    expect(warehouse.active).toBe(true);
  });

  it('produces a Warehouse with no address/location field', () => {
    const warehouse = createWarehouse({ name: 'Pinar del Río' });
    expect(Object.keys(warehouse)).not.toContain('address');
    expect(Object.keys(warehouse)).not.toContain('location');
  });
});
