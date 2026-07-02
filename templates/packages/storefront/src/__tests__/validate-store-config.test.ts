import { describe, it, expect } from 'vitest';
import { validateStoreConfig } from '../config/validate';
import type { StoreConfig } from '../config/types';

function makeValidConfig(): StoreConfig {
  return {
    vertical: 'clothes',
    brand: { name: 'Boutique Exclusiva', copyright: '(c) Boutique Exclusiva' },
    locale: 'es-NI',
    currency: 'NIO',
    theme: {},
    logo: { alt: 'Boutique Exclusiva logo' },
    hero: { image: '/hero.jpg', heading: 'Welcome', subheading: 'New season' },
    nav: [{ label: 'Home', path: '/', kind: 'route' }],
    footer: { copyright: '(c) Boutique Exclusiva' },
    catalog: {
      categories: [{ id: 'cat-tops', name: 'Tops' }],
      products: [
        {
          id: 'p1',
          name: 'Blue Shirt',
          description: 'A blue shirt',
          price: 25,
          categoryId: 'cat-tops',
          image: '/blue-shirt.jpg',
        },
      ],
    },
  };
}

describe('validateStoreConfig', () => {
  it('returns the same config unchanged when it is valid', () => {
    const config = makeValidConfig();

    expect(validateStoreConfig(config)).toEqual(config);
  });

  it('throws naming "brand.name" when brand.name is missing', () => {
    const config = makeValidConfig();
    config.brand.name = '';

    expect(() => validateStoreConfig(config)).toThrow(/brand\.name/);
  });

  it('throws when nav is an empty array (must have >= 1 entry)', () => {
    const config = makeValidConfig();
    config.nav = [];

    expect(() => validateStoreConfig(config)).toThrow(/nav/);
  });

  it('throws a duplicate-ID error when two products share the same id (regression: legacy id "30"/"32" bug)', () => {
    const config = makeValidConfig();
    config.catalog.products = [
      { id: '30', name: 'A', description: 'a', price: 10, categoryId: 'cat-tops', image: '/a.jpg' },
      { id: '30', name: 'B', description: 'b', price: 20, categoryId: 'cat-tops', image: '/b.jpg' },
    ];

    expect(() => validateStoreConfig(config)).toThrow(/duplicate/i);
    expect(() => validateStoreConfig(config)).toThrow(/30/);
  });

  it('passes when all product ids are unique', () => {
    const config = makeValidConfig();
    config.catalog.products = [
      { id: 'p1', name: 'A', description: 'a', price: 10, categoryId: 'cat-tops', image: '/a.jpg' },
      { id: 'p2', name: 'B', description: 'b', price: 20, categoryId: 'cat-tops', image: '/b.jpg' },
    ];

    expect(() => validateStoreConfig(config)).not.toThrow();
  });

  it('throws when a product.categoryId does not reference an existing category', () => {
    const config = makeValidConfig();
    config.catalog.products[0].categoryId = 'cat-does-not-exist';

    expect(() => validateStoreConfig(config)).toThrow(/categoryId|category/i);
  });

  it('throws when a product.originalPrice is not greater than price', () => {
    const config = makeValidConfig();
    config.catalog.products[0].originalPrice = 20; // price is 25, so this must be > price
    config.catalog.products[0].price = 25;

    expect(() => validateStoreConfig(config)).toThrow(/originalPrice/);
  });

  it('degrades gracefully when optional fields (brand.tagline, features, hero.overlay) are omitted', () => {
    const config = makeValidConfig();
    delete config.brand.tagline;
    delete config.features;
    delete config.hero.overlayColor;
    delete config.hero.overlayOpacity;

    expect(() => validateStoreConfig(config)).not.toThrow();
  });
});
