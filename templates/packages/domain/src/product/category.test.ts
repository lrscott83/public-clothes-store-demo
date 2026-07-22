import { describe, it, expect } from 'vitest';
import {
  assertValidCategoryName,
  assertValidCategorySlug,
  createCategory,
} from './category.js';
import { InvalidCategoryError } from './errors.js';

describe('createCategory — invariants', () => {
  it('rejects an empty slug', () => {
    expect(() => createCategory({ name: 'Cafeteras', slug: '', order: 1 })).toThrow(
      InvalidCategoryError,
    );
  });

  it('rejects a whitespace-only slug', () => {
    expect(() => createCategory({ name: 'Cafeteras', slug: '   ', order: 1 })).toThrow(
      InvalidCategoryError,
    );
  });

  it('accepts valid name + slug', () => {
    const category = createCategory({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
    expect(category.name).toBe('Cafeteras');
    expect(category.slug).toBe('cafeteras');
    expect(category.active).toBe(true);
  });

  it('produces a Category with no parentId field — FLAT, no hierarchy', () => {
    const category = createCategory({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
    expect(Object.keys(category)).not.toContain('parentId');
  });
});

// Atomic field guards — reused by createCategory AND by the API update path,
// where a partial patch validates only the fields it actually carries.
describe('assertValidCategoryName', () => {
  it('rejects an empty name', () => {
    expect(() => assertValidCategoryName('')).toThrow(InvalidCategoryError);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => assertValidCategoryName('   ')).toThrow(InvalidCategoryError);
  });

  it('accepts a non-empty name', () => {
    expect(() => assertValidCategoryName('Cafeteras')).not.toThrow();
  });
});

describe('assertValidCategorySlug', () => {
  it('rejects an empty slug', () => {
    expect(() => assertValidCategorySlug('')).toThrow(InvalidCategoryError);
  });

  it('rejects a whitespace-only slug', () => {
    expect(() => assertValidCategorySlug('   ')).toThrow(InvalidCategoryError);
  });

  it('accepts a non-empty slug', () => {
    expect(() => assertValidCategorySlug('cafeteras')).not.toThrow();
  });
});
