import { BadRequestException } from '@nestjs/common';
import { assertNotMintedRef } from './assert-not-minted-ref.js';

describe('assertNotMintedRef', () => {
  it('rejects a ref shaped like one the store minted', () => {
    expect(() =>
      assertNotMintedRef('products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'products'),
    ).toThrow(BadRequestException);
  });

  it('allows a seeded catalogue ref — the deliberate escape hatch', () => {
    expect(() =>
      assertNotMintedRef('products/cafeteras/cafeteras1.jpeg', 'products'),
    ).not.toThrow();
  });

  it('allows an absent image', () => {
    expect(() => assertNotMintedRef(undefined, 'products')).not.toThrow();
    expect(() => assertNotMintedRef(null, 'products')).not.toThrow();
  });

  it('scopes the check to the collection it was given', () => {
    expect(() =>
      assertNotMintedRef('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'categories'),
    ).toThrow(BadRequestException);
  });
});
