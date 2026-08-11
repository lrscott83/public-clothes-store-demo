import { describe, it, expect } from 'vitest';
import { assertProductImageRef } from './product-image-store.port.js';

describe('assertProductImageRef', () => {
  it('accepts a fresh-upload ref shape (products/<uuid>.webp)', () => {
    expect(() =>
      assertProductImageRef('products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp'),
    ).not.toThrow();
  });

  it('accepts a seeded ref shape (products/<category>/<slug>.jpeg)', () => {
    expect(() => assertProductImageRef('products/cafeteras/cafeteras1.jpeg')).not.toThrow();
  });

  it('accepts .jpg, .png and .webp extensions', () => {
    expect(() => assertProductImageRef('products/a.jpg')).not.toThrow();
    expect(() => assertProductImageRef('products/a.png')).not.toThrow();
    expect(() => assertProductImageRef('products/a.webp')).not.toThrow();
  });

  it('rejects a ref containing ".."', () => {
    expect(() => assertProductImageRef('products/../etc/passwd.png')).toThrow();
  });

  it('rejects a ref with a leading "/"', () => {
    expect(() => assertProductImageRef('/etc/passwd.png')).toThrow();
  });

  it('rejects a ref containing a backslash', () => {
    expect(() => assertProductImageRef('products\\evil.png')).toThrow();
  });

  it('rejects a ref with no recognized extension', () => {
    expect(() => assertProductImageRef('products/a.gif')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => assertProductImageRef('')).toThrow();
  });
});
