import { describe, it, expect } from 'vitest';
import { createBakedCatalogProvider } from '../catalog/baked-provider';
import type { CatalogData } from '../catalog/types';

const catalogData: CatalogData = {
  categories: [
    { id: 'cat-tops', name: 'Tops', order: 1 },
    { id: 'cat-bottoms', name: 'Bottoms', order: 2 },
  ],
  products: [
    {
      id: 'p1',
      name: 'Blue Shirt',
      description: 'A blue shirt',
      price: 25,
      categoryId: 'cat-tops',
      image: '/blue-shirt.jpg',
    },
    {
      id: 'p2',
      name: 'Red Shirt',
      description: 'A red shirt',
      price: 30,
      categoryId: 'cat-tops',
      image: '/red-shirt.jpg',
    },
    {
      id: 'p3',
      name: 'Black Jeans',
      description: 'Black jeans',
      price: 45,
      categoryId: 'cat-bottoms',
      image: '/black-jeans.jpg',
    },
  ],
};

describe('createBakedCatalogProvider', () => {
  it('returns all categories from getCategories()', () => {
    const provider = createBakedCatalogProvider(catalogData);

    expect(provider.getCategories()).toEqual(catalogData.categories);
  });

  it('returns all products from getProducts()', () => {
    const provider = createBakedCatalogProvider(catalogData);

    expect(provider.getProducts()).toHaveLength(3);
    expect(provider.getProducts().map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('resolves a product by id via getProductById()', () => {
    const provider = createBakedCatalogProvider(catalogData);

    expect(provider.getProductById('p2')?.name).toBe('Red Shirt');
  });

  it('returns undefined from getProductById() for a missing id', () => {
    const provider = createBakedCatalogProvider(catalogData);

    expect(provider.getProductById('does-not-exist')).toBeUndefined();
  });

  it('filters products by categoryId via getProductsByCategory()', () => {
    const provider = createBakedCatalogProvider(catalogData);

    const tops = provider.getProductsByCategory('cat-tops');
    expect(tops.map((p) => p.id)).toEqual(['p1', 'p2']);

    const bottoms = provider.getProductsByCategory('cat-bottoms');
    expect(bottoms.map((p) => p.id)).toEqual(['p3']);
  });

  it('returns an empty array from getProductsByCategory() for a category with no products', () => {
    const provider = createBakedCatalogProvider(catalogData);

    expect(provider.getProductsByCategory('cat-nonexistent')).toEqual([]);
  });
});
