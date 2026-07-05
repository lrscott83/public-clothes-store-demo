import { describe, expect, it } from 'vitest';
import type { StoreProduct } from '@store-mgmt/storefront/catalog';
import {
  pageCount,
  paginate,
  paginationRange,
  searchProducts,
  sortProducts,
} from '../product-filters';

function product(overrides: Partial<StoreProduct> & Pick<StoreProduct, 'id'>): StoreProduct {
  return {
    name: 'Item',
    description: 'desc',
    price: 10,
    categoryId: 'cat',
    image: '/x.jpg',
    ...overrides,
  };
}

const catalog: StoreProduct[] = [
  product({ id: '1', name: 'Nevera No Frost', description: 'Refrigerador', price: 800 }),
  product({ id: '2', name: 'Televisor 55"', description: 'Smart TV 4K', price: 500 }),
  product({ id: '3', name: 'Aire acondicionado', description: 'Split inverter', price: 650 }),
];

describe('searchProducts', () => {
  it('matches on name, case-insensitively', () => {
    expect(searchProducts(catalog, 'nevera').map((p) => p.id)).toEqual(['1']);
  });

  it('matches on description too', () => {
    expect(searchProducts(catalog, 'inverter').map((p) => p.id)).toEqual(['3']);
  });

  it('returns every product for a blank query', () => {
    expect(searchProducts(catalog, '   ')).toHaveLength(3);
  });
});

describe('sortProducts', () => {
  it('sorts by price ascending and descending without mutating the input', () => {
    const asc = sortProducts(catalog, 'price-asc').map((p) => p.id);
    const desc = sortProducts(catalog, 'price-desc').map((p) => p.id);
    expect(asc).toEqual(['2', '3', '1']);
    expect(desc).toEqual(['1', '3', '2']);
    // Input order preserved (no in-place mutation).
    expect(catalog.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by name A→Z', () => {
    expect(sortProducts(catalog, 'name-asc').map((p) => p.name)[0]).toBe('Aire acondicionado');
  });

  it('preserves catalog order for the featured default', () => {
    expect(sortProducts(catalog, 'featured').map((p) => p.id)).toEqual(['1', '2', '3']);
  });
});

describe('pagination', () => {
  it('computes at least one page even for an empty list', () => {
    expect(pageCount(0, 12)).toBe(1);
    expect(pageCount(25, 12)).toBe(3);
  });

  it('slices the requested page', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(paginate(items, 1, 12)).toHaveLength(12);
    expect(paginate(items, 3, 12)).toEqual([25]);
  });

});

describe('paginationRange', () => {
  it('lists every page with no ellipsis when total is 5 or fewer', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(2, 4)).toEqual([1, 2, 3, 4]);
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('anchors first four + ellipsis + last near the start (image 1: page 3 of 6)', () => {
    expect(paginationRange(1, 6)).toEqual([1, 2, 3, 4, 'ellipsis', 6]);
    expect(paginationRange(3, 6)).toEqual([1, 2, 3, 4, 'ellipsis', 6]);
  });

  it('anchors first + ellipsis + last four near the end (image 2: page 4 of 6)', () => {
    expect(paginationRange(4, 6)).toEqual([1, 'ellipsis', 3, 4, 5, 6]);
    expect(paginationRange(6, 6)).toEqual([1, 'ellipsis', 3, 4, 5, 6]);
  });

  it('flanks the current page with two ellipses in the middle of a long list', () => {
    expect(paginationRange(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
    expect(paginationRange(6, 10)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 10]);
  });

  it('always keeps exactly five page numbers visible when total is over 5', () => {
    for (const [current, total] of [
      [1, 6],
      [3, 6],
      [4, 6],
      [5, 10],
      [7, 12],
      [12, 12],
    ] as const) {
      const numeric = paginationRange(current, total).filter((item) => typeof item === 'number');
      expect(numeric).toHaveLength(5);
    }
  });
});
