import { describe, expect, it } from 'vitest';
import { eligibleWarehouses, type CartLine } from '../availability';
import type { InventoryEntry, Warehouse } from '../types';

const warehouses: Warehouse[] = [
  { id: 'wh-1', name: 'Almacén 1' },
  { id: 'wh-2', name: 'Almacén 2' },
];

describe('eligibleWarehouses', () => {
  it('includes a warehouse with exact matching stock (exact-cover)', () => {
    const cart: CartLine[] = [{ productId: 'p-1', quantity: 5 }];
    const inventory: InventoryEntry[] = [{ productId: 'p-1', warehouseId: 'wh-1', quantity: 5 }];

    const result = eligibleWarehouses(cart, inventory, [warehouses[0]]);

    expect(result).toEqual([warehouses[0]]);
  });

  it('excludes a warehouse with insufficient quantity for a line', () => {
    const cart: CartLine[] = [{ productId: 'p-1', quantity: 4 }];
    const inventory: InventoryEntry[] = [{ productId: 'p-1', warehouseId: 'wh-1', quantity: 3 }];

    const result = eligibleWarehouses(cart, inventory, [warehouses[0]]);

    expect(result).toEqual([]);
  });

  it('excludes a warehouse missing an inventory entry for a requested product', () => {
    const cart: CartLine[] = [{ productId: 'p-1', quantity: 1 }];
    const inventory: InventoryEntry[] = [{ productId: 'p-2', warehouseId: 'wh-1', quantity: 10 }];

    const result = eligibleWarehouses(cart, inventory, [warehouses[0]]);

    expect(result).toEqual([]);
  });

  it('returns an empty list when zero warehouses qualify', () => {
    const cart: CartLine[] = [{ productId: 'p-1', quantity: 5 }];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 1 },
      { productId: 'p-1', warehouseId: 'wh-2', quantity: 2 },
    ];

    const result = eligibleWarehouses(cart, inventory, warehouses);

    expect(result).toEqual([]);
  });

  it('for a multi-line cart, requires every line to be covered by the same warehouse', () => {
    const cart: CartLine[] = [
      { productId: 'p-1', quantity: 2 },
      { productId: 'p-2', quantity: 4 },
    ];
    const inventory: InventoryEntry[] = [
      // wh-1 covers both lines fully
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 2 },
      { productId: 'p-2', warehouseId: 'wh-1', quantity: 4 },
      // wh-2 covers line 1 but falls short on line 2
      { productId: 'p-1', warehouseId: 'wh-2', quantity: 2 },
      { productId: 'p-2', warehouseId: 'wh-2', quantity: 3 },
    ];

    const result = eligibleWarehouses(cart, inventory, warehouses);

    expect(result).toEqual([warehouses[0]]);
  });
});
