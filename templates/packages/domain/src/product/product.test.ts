import { describe, it, expect } from 'vitest';
import {
  assertValidProductCost,
  assertValidProductDiscountPrice,
  assertValidProductPercentDiscount,
  assertValidProductPrice,
  createProduct,
} from './product.js';
import { InvalidProductError } from './errors.js';
import { money } from '../currency/money.js';

function validInput() {
  return {
    name: 'Cafetera Express',
    description: 'Cafetera express de 15 bares con vaporizador de leche.',
    price: money(10000n, 'USD'), // $100.00
    cost: money(6000n, 'USD'), // $60.00
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

  it('rejects discountPrice < 0', () => {
    expect(() => createProduct({ ...validInput(), discountPrice: -1n })).toThrow(
      InvalidProductError,
    );
  });

  it('rejects cost.minorUnits < 0', () => {
    expect(() => createProduct({ ...validInput(), cost: money(-1n, 'USD') })).toThrow(
      InvalidProductError,
    );
  });

  it('accepts non-USD Money on price — currency is caller-chosen, not forced', () => {
    const product = createProduct({ ...validInput(), price: money(10000n, 'EUR') });
    expect(product.price.currency).toBe('EUR');
  });

  it('accepts non-USD Money on cost — currency is caller-chosen, not forced', () => {
    const product = createProduct({ ...validInput(), cost: money(6000n, 'MN') });
    expect(product.cost.currency).toBe('MN');
  });

  it('accepts price and cost denominated in DIFFERENT currencies', () => {
    const product = createProduct({
      ...validInput(),
      price: money(10000n, 'EUR'),
      cost: money(6000n, 'MN'),
    });
    expect(product.price.currency).toBe('EUR');
    expect(product.cost.currency).toBe('MN');
  });

  it('validates atomic field guards for the partial-update path', () => {
    // assertValidProductPrice
    expect(() => assertValidProductPrice(money(0n, 'USD'))).toThrow(InvalidProductError);
    expect(() => assertValidProductPrice(money(-100n, 'USD'))).toThrow(InvalidProductError);
    expect(() => assertValidProductPrice(money(1n, 'USD'))).not.toThrow();

    // assertValidProductCost
    expect(() => assertValidProductCost(money(-1n, 'USD'))).toThrow(InvalidProductError);
    expect(() => assertValidProductCost(money(0n, 'USD'))).not.toThrow();

    // assertValidProductPercentDiscount
    expect(() => assertValidProductPercentDiscount(-1n)).toThrow(InvalidProductError);
    expect(() => assertValidProductPercentDiscount(10_001n)).toThrow(InvalidProductError);
    expect(() => assertValidProductPercentDiscount(0n)).not.toThrow();
    expect(() => assertValidProductPercentDiscount(10_000n)).not.toThrow();

    // assertValidProductDiscountPrice
    expect(() => assertValidProductDiscountPrice(-1n)).toThrow(InvalidProductError);
    expect(() => assertValidProductDiscountPrice(0n)).not.toThrow();
  });

  it('accepts valid input and defaults percentDiscountPrice/discountPrice to 0 when omitted', () => {
    const product = createProduct(validInput());
    expect(product.percentDiscountPrice).toBe(0n);
    expect(product.discountPrice).toBe(0n);
    expect(product.isNew).toBe(false);
    expect(product.active).toBe(true);
    expect(product.name).toBe('Cafetera Express');
    expect(product.categoryId).toBe('category-uuid-1');
  });
});

describe('createProduct — optional image', () => {
  it('defaults a missing image to null', () => {
    const product = createProduct({ ...validInput(), image: undefined });

    expect(product.image).toBeNull();
  });

  it('keeps an explicitly provided ref', () => {
    const product = createProduct({
      ...validInput(),
      image: 'products/cafeteras/cafeteras1.jpeg',
    });

    expect(product.image).toBe('products/cafeteras/cafeteras1.jpeg');
  });
});
