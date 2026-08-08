import { describe, it, expect } from 'vitest';
import type { StockLevel } from '../inventory/stock-level.js';
import {
  assertWarehouseCoversBasket,
  eligibleWarehouses,
  warehouseCoversBasket,
  type BasketLine,
} from './availability.js';
import { WarehouseCannotFulfillOrderError } from './errors.js';

function level(
  warehouseId: string,
  productId: string,
  onHand: number,
  reserved = 0,
): StockLevel {
  return {
    id: `sl-${warehouseId}-${productId}`,
    productId,
    warehouseId,
    onHand,
    reserved,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

const basket: BasketLine[] = [
  { productId: 'p-1', quantity: 2 },
  { productId: 'p-2', quantity: 1 },
];

describe('warehouseCoversBasket', () => {
  it('covers when every line has enough available stock', () => {
    const levels = [level('w-1', 'p-1', 5), level('w-1', 'p-2', 3)];
    expect(warehouseCoversBasket('w-1', basket, levels)).toBe(true);
  });

  it('does NOT cover when one line is short — whole-basket, not partial', () => {
    const levels = [level('w-1', 'p-1', 5), level('w-1', 'p-2', 0)];
    expect(warehouseCoversBasket('w-1', basket, levels)).toBe(false);
  });

  it('measures AVAILABLE (onHand - reserved), not onHand', () => {
    // `onHand` alone would accept this basket against stock already committed
    // to a verified order — producing exactly the 409-at-confirm this
    // invariant exists to prevent.
    const levels = [level('w-1', 'p-1', 5, 4), level('w-1', 'p-2', 3)];
    expect(warehouseCoversBasket('w-1', basket, levels)).toBe(false);
  });

  it('treats a missing StockLevel row as zero, never as unlimited', () => {
    const levels = [level('w-1', 'p-1', 5)]; // no row at all for p-2
    expect(warehouseCoversBasket('w-1', basket, levels)).toBe(false);
  });

  it('sums duplicate product ids in the basket before comparing', () => {
    const duplicated: BasketLine[] = [
      { productId: 'p-1', quantity: 2 },
      { productId: 'p-1', quantity: 2 },
    ];
    expect(warehouseCoversBasket('w-1', duplicated, [level('w-1', 'p-1', 4)])).toBe(true);
    expect(warehouseCoversBasket('w-1', duplicated, [level('w-1', 'p-1', 3)])).toBe(false);
  });

  it('ignores stock rows belonging to other warehouses', () => {
    const levels = [level('w-2', 'p-1', 99), level('w-2', 'p-2', 99)];
    expect(warehouseCoversBasket('w-1', basket, levels)).toBe(false);
  });

  it('an empty basket is covered by any warehouse — vacuously true', () => {
    expect(warehouseCoversBasket('w-1', [], [])).toBe(true);
  });
});

describe('eligibleWarehouses', () => {
  it('returns only the warehouses that fully cover the basket', () => {
    const levels = [
      level('w-1', 'p-1', 5),
      level('w-1', 'p-2', 3),
      level('w-2', 'p-1', 5),
      level('w-2', 'p-2', 0), // short
      level('w-3', 'p-1', 2),
      level('w-3', 'p-2', 1), // exactly enough
    ];
    expect(eligibleWarehouses(basket, ['w-1', 'w-2', 'w-3'], levels)).toEqual(['w-1', 'w-3']);
  });

  it('returns an empty array when no warehouse qualifies', () => {
    const levels = [level('w-1', 'p-1', 1), level('w-2', 'p-2', 1)];
    expect(eligibleWarehouses(basket, ['w-1', 'w-2'], levels)).toEqual([]);
  });

  it('is unaffected by warehouse scope — every candidate is considered', () => {
    // The sales agent is bound to NO warehouse (D2). This function must never
    // narrow its candidate set on the caller's behalf.
    const levels = [level('w-9', 'p-1', 5), level('w-9', 'p-2', 5)];
    expect(eligibleWarehouses(basket, ['w-9'], levels)).toEqual(['w-9']);
  });
});

describe('assertWarehouseCoversBasket', () => {
  it('returns silently when the warehouse covers the basket', () => {
    const levels = [level('w-1', 'p-1', 5), level('w-1', 'p-2', 3)];
    expect(() => assertWarehouseCoversBasket('w-1', basket, levels)).not.toThrow();
  });

  it('throws WarehouseCannotFulfillOrderError naming the warehouse when it does not', () => {
    const levels = [level('w-1', 'p-1', 5)];
    expect(() => assertWarehouseCoversBasket('w-1', basket, levels)).toThrow(
      WarehouseCannotFulfillOrderError,
    );
    expect(() => assertWarehouseCoversBasket('w-1', basket, levels)).toThrow(/w-1/);
  });
});
