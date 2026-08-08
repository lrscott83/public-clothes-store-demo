import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStoreConfig } from '@store-mgmt/storefront/config';
import { demoConfig } from '../demo/store.config';

// Same pattern as `clothes-config.test.ts`: `verticalAsset('demo', key)`
// resolves to `/verticals/demo/<key>` with the default base ('/'); resolve
// that back to the filesystem path under this app's `public/` to assert
// every referenced asset actually exists.
const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

function assertAssetExists(url: string) {
  expect(url.startsWith('/verticals/demo/')).toBe(true);
  const relative = url.replace(/^\//, '');
  const filePath = `${PUBLIC_ROOT}/${relative}`;
  expect(existsSync(filePath)).toBe(true);
}

describe('demo vertical config', () => {
  it('passes validateStoreConfig (required fields, unique product ids, categoryId integrity)', () => {
    expect(() => validateStoreConfig(demoConfig)).not.toThrow();
  });

  it('has a distinct brand name from the clothes vertical', () => {
    expect(demoConfig.brand.name).toBe('Demo Store');
    expect(demoConfig.brand.name).not.toBe('Boutique Exclusiva');
  });

  it('has no duplicate product ids', () => {
    const ids = demoConfig.catalog.products.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every product references a category that exists in the catalog', () => {
    const categoryIds = new Set(demoConfig.catalog.categories.map((category) => category.id));
    for (const product of demoConfig.catalog.products) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
    }
  });

  it('has a real, resolvable hero image asset', () => {
    assertAssetExists(demoConfig.hero.image);
  });

  it('every product image asset resolves to a real file under public/verticals/demo/', () => {
    for (const product of demoConfig.catalog.products) {
      assertAssetExists(product.image);
    }
  });

  it('is a minimal catalog (2-3 products across 1-2 categories) — proves the mechanism, not a real store', () => {
    expect(demoConfig.catalog.products.length).toBeGreaterThanOrEqual(2);
    expect(demoConfig.catalog.products.length).toBeLessThanOrEqual(3);
    expect(demoConfig.catalog.categories.length).toBeGreaterThanOrEqual(1);
    expect(demoConfig.catalog.categories.length).toBeLessThanOrEqual(2);
  });
});
