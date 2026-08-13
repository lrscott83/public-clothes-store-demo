import { describe, expect, it } from 'vitest';
import {
  assertImageRef,
  InvalidImageRefError,
  isUploadMintedRef,
} from './image-store.port.js';

describe('assertImageRef', () => {
  it.each([
    'products/cafeteras/cafeteras1.jpeg',
    'categories/remeras.jpg',
    'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
    'categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.png',
  ])('accepts %s', (ref) => {
    expect(() => assertImageRef(ref)).not.toThrow();
  });

  it.each([
    '../etc/passwd',
    '/absolute/path.png',
    'products\\windows.png',
    'products/no-extension',
    'products/x.gif',
    'Products/Upper.png',
  ])('rejects %s', (ref) => {
    expect(() => assertImageRef(ref)).toThrow(InvalidImageRefError);
  });
});

describe('isUploadMintedRef', () => {
  it('recognises a ref the store minted for that collection', () => {
    expect(
      isUploadMintedRef('products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'products'),
    ).toBe(true);
    expect(
      isUploadMintedRef('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'categories'),
    ).toBe(true);
  });

  it('does not match a minted ref from a DIFFERENT collection', () => {
    expect(
      isUploadMintedRef('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'products'),
    ).toBe(false);
  });

  it.each([
    ['a seeded ref', 'products/cafeteras/cafeteras1.jpeg'],
    ['a hand-authored ref', 'products/remera.jpg'],
    ['null', null],
    ['undefined', undefined],
  ])('does not match %s', (_label, ref) => {
    expect(isUploadMintedRef(ref as string | null | undefined, 'products')).toBe(false);
  });
});
