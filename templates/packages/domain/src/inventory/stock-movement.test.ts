import { describe, it, expect } from 'vitest';
import { createStockMovement, movementDirection } from './stock-movement.js';
import { InvalidStockMovementError } from './errors.js';

function validInput() {
  return {
    productId: 'product-uuid-1',
    warehouseId: 'warehouse-uuid-1',
    type: 'purchase_in' as const,
    quantity: 10,
  };
}

describe('StockMovementType — closed union', () => {
  it('movementDirection returns -1 for every *_out type', () => {
    expect(movementDirection('sale_out')).toBe(-1);
    expect(movementDirection('transfer_out')).toBe(-1);
    expect(movementDirection('adjustment_out')).toBe(-1);
  });

  it('movementDirection returns 1 for every *_in type', () => {
    expect(movementDirection('purchase_in')).toBe(1);
    expect(movementDirection('transfer_in')).toBe(1);
    expect(movementDirection('adjustment_in')).toBe(1);
  });
});

describe('createStockMovement — invariants', () => {
  it('rejects quantity <= 0', () => {
    expect(() => createStockMovement({ ...validInput(), quantity: 0 })).toThrow(
      InvalidStockMovementError,
    );
    expect(() => createStockMovement({ ...validInput(), quantity: -1 })).toThrow(
      InvalidStockMovementError,
    );
  });

  it('rejects a non-integer quantity', () => {
    expect(() => createStockMovement({ ...validInput(), quantity: 1.5 })).toThrow(
      InvalidStockMovementError,
    );
  });

  it('defaults reason to null when omitted', () => {
    const movement = createStockMovement(validInput());
    expect(movement.reason).toBeNull();
  });

  it('defaults createdBy to null when omitted', () => {
    const movement = createStockMovement(validInput());
    expect(movement.createdBy).toBeNull();
  });

  it('accepts an explicit reason and createdBy', () => {
    const movement = createStockMovement({
      ...validInput(),
      type: 'adjustment_out',
      reason: 'Physical count discrepancy',
      createdBy: 'user-uuid-1',
    });
    expect(movement.reason).toBe('Physical count discrepancy');
    expect(movement.createdBy).toBe('user-uuid-1');
  });
});
