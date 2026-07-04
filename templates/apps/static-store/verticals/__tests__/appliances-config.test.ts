import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStoreConfig } from '@store-mgmt/storefront/config';
import { appliancesConfig } from '../appliances/store.config';

// `verticalAsset('appliances', key)` resolves to `/verticals/appliances/<key>`
// with the default base ('/'); resolve that back to the filesystem path under
// this app's `public/` to assert every referenced asset actually exists.
// Vitest's `root` is this package's directory, so `process.cwd()` is
// `templates/apps/static-store`.
const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

function assertAssetExists(url: string) {
  expect(url.startsWith('/verticals/appliances/')).toBe(true);
  const relative = url.replace(/^\//, '');
  const filePath = `${PUBLIC_ROOT}/${relative}`;
  expect(existsSync(filePath)).toBe(true);
}

describe('appliances vertical config', () => {
  it('passes validateStoreConfig (required fields, unique product ids, categoryId integrity)', () => {
    expect(() => validateStoreConfig(appliancesConfig)).not.toThrow();
  });

  it('has no duplicate product ids', () => {
    const ids = appliancesConfig.catalog.products.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every product references a category that exists in the catalog', () => {
    const categoryIds = new Set(appliancesConfig.catalog.categories.map((category) => category.id));
    for (const product of appliancesConfig.catalog.products) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
    }
  });

  it('every discount product has a strictly-higher originalPrice', () => {
    for (const product of appliancesConfig.catalog.products) {
      if (product.discount !== undefined || product.originalPrice !== undefined) {
        expect(product.originalPrice).toBeGreaterThan(product.price);
      }
    }
  });

  it('has a real, resolvable hero image asset', () => {
    assertAssetExists(appliancesConfig.hero.image);
  });

  it('every product image asset resolves to a real file under public/verticals/appliances/', () => {
    for (const product of appliancesConfig.catalog.products) {
      assertAssetExists(product.image);
    }
  });

  it('publishes the full extracted catalog (74 products across 11 categories)', () => {
    expect(appliancesConfig.catalog.products.length).toBe(74);
    expect(appliancesConfig.catalog.categories.length).toBe(11);
  });
});
