import type { StoreConfig } from '@store-mgmt/storefront/config';

/**
 * Minimal, valid `StoreConfig` fixture builder shared across component
 * tests. Every field a component under test does NOT care about is filled
 * with an innocuous default so tests can override only what they assert on.
 */
export function buildStoreConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    vertical: 'fixture',
    brand: { name: 'Fixture Brand', copyright: '© Fixture Brand' },
    locale: 'en-US',
    currency: 'USD',
    theme: {},
    logo: { icon: 'Store', alt: 'Fixture Brand logo' },
    hero: {
      image: '/fixture-hero.jpg',
      heading: 'Fixture heading',
      subheading: 'Fixture subheading',
    },
    nav: [{ label: 'Home', path: '/', kind: 'route' }],
    footer: { copyright: '© Fixture Brand' },
    catalog: {
      categories: [{ id: 'fixture-category', name: 'Fixture Category' }],
      products: [],
    },
    ...overrides,
  };
}
