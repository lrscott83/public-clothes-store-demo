import { describe, it, expect } from 'vitest';
import { createProduct } from './product.js';
import { InvalidProductError } from './errors.js';
import { money } from '../currency/money.js';

function validInput() {
  return {
    name: 'Cafetera Express',
    description: 'Cafetera express de 15 bares con vaporizador de leche.',
    price: money(10000n, 'USD'), // $100.00
    costoUSD: money(6000n, 'USD'), // $60.00
    categoryId: 'category-uuid-1',
    image: 'https://example.com/cafetera.png',
    order: 1,
  };
}

describe('createProduct — invariants', () => {
  it('rejects price.minorUnits <= 0', () => {
    expect(() => createProduct({ ...validInput(), price: money(0n, 'USD') })).toThrow(
      InvalidProductError,
    );
    expect(() => createProduct({ ...validInput(), price: money(-100n, 'USD') })).toThrow(
      InvalidProductError,
    );
  });

  it('rejects percentDiscountPrice outside [0, 100_00] (scale-2 bounds)', () => {
    expect(() =>
      createProduct({ ...validInput(), percentDiscountPrice: -1n }),
    ).toThrow(InvalidProductError);
    expect(() =>
      createProduct({ ...validInput(), percentDiscountPrice: 10_001n }),
    ).toThrow(InvalidProductError);
  });

  it('rejects discountPrice.minorUnits < 0', () => {
    expect(() =>
      createProduct({ ...validInput(), discountPrice: money(-1n, 'USD') }),
    ).toThrow(InvalidProductError);
  });

  it('rejects non-USD Money on price', () => {
    expect(() => createProduct({ ...validInput(), price: money(10000n, 'EUR') })).toThrow(
      InvalidProductError,
    );
  });

  it('rejects non-USD Money on discountPrice', () => {
    expect(() =>
      createProduct({ ...validInput(), discountPrice: money(100n, 'MN') }),
    ).toThrow(InvalidProductError);
  });

  it('rejects non-USD Money on costoUSD', () => {
    expect(() => createProduct({ ...validInput(), costoUSD: money(6000n, 'EUR') })).toThrow(
      InvalidProductError,
    );
  });

  it('accepts valid input and defaults percentDiscountPrice/discountPrice to 0 when omitted', () => {
    const product = createProduct(validInput());
    expect(product.percentDiscountPrice).toBe(0n);
    expect(product.discountPrice.minorUnits).toBe(0n);
    expect(product.discountPrice.currency).toBe('USD');
    expect(product.isNew).toBe(false);
    expect(product.active).toBe(true);
    expect(product.name).toBe('Cafetera Express');
    expect(product.categoryId).toBe('category-uuid-1');
  });
});
