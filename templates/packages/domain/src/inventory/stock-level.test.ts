import { describe, it, expect } from 'vitest';
import { applyMovement, availableStock, createStockLevel } from './stock-level.js';
import { InvalidStockLevelError, NegativeStockError } from './errors.js';

function validInput() {
  return {
    productId: 'product-uuid-1',
    warehouseId: 'warehouse-uuid-1',
    onHand: 10,
    reserved: 3,
  };
}

describe('createStockLevel — invariants', () => {
  it('rejects a negative onHand', () => {
    expect(() => createStockLevel({ ...validInput(), onHand: -1 })).toThrow(
      InvalidStockLevelError,
    );
  });

  it('rejects a non-integer onHand', () => {
    expect(() => createStockLevel({ ...validInput(), onHand: 1.5 })).toThrow(
      InvalidStockLevelError,
    );
  });

  it('rejects a negative reserved', () => {
    expect(() => createStockLevel({ ...validInput(), reserved: -1 })).toThrow(
      InvalidStockLevelError,
    );
  });

  it('rejects a non-integer reserved', () => {
    expect(() => createStockLevel({ ...validInput(), reserved: 1.5 })).toThrow(
      InvalidStockLevelError,
    );
  });

  it('accepts valid onHand/reserved and defaults them to 0 when omitted', () => {
    const level = createStockLevel({ productId: 'p', warehouseId: 'w' });
    expect(level.onHand).toBe(0);
    expect(level.reserved).toBe(0);
  });
});

describe('availableStock — pure derivation', () => {
  it('derives onHand - reserved, e.g. 10,3 -> 7', () => {
    const level = createStockLevel(validInput());
    expect(availableStock(level)).toBe(7);
  });

  it('is never a stored field on StockLevel', () => {
    const level = createStockLevel(validInput());
    expect(Object.keys(level)).not.toContain('available');
  });
});

describe('applyMovement — pure guard', () => {
  it('_in types add to onHand', () => {
    const level = createStockLevel({ ...validInput(), onHand: 5, reserved: 0 });
    const next = applyMovement(level, 'purchase_in', 10);
    expect(next.onHand).toBe(15);
  });

  it('_out types subtract from onHand', () => {
    const level = createStockLevel({ ...validInput(), onHand: 10, reserved: 0 });
    const next = applyMovement(level, 'sale_out', 4);
    expect(next.onHand).toBe(6);
  });

  it('throws NegativeStockError when the result would be < 0', () => {
    const level = createStockLevel({ ...validInput(), onHand: 2, reserved: 0 });
    expect(() => applyMovement(level, 'sale_out', 5)).toThrow(NegativeStockError);
  });
});
