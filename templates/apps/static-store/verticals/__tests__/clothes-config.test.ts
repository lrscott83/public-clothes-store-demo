import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStoreConfig } from '@store-mgmt/storefront/config';
import { clothesConfig } from '../clothes/store.config';

// `verticalAsset('clothes', key)` resolves to `/verticals/clothes/<key>` with
// the default base ('/'); resolve that back to the filesystem path under
// this app's `public/` to assert every referenced asset actually exists.
// Vitest's `root` is this package's directory (see vitest.config.ts), so
// `process.cwd()` is `templates/apps/static-store`.
const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

function assertAssetExists(url: string) {
  expect(url.startsWith('/verticals/clothes/')).toBe(true);
  const relative = url.replace(/^\//, '');
  const filePath = `${PUBLIC_ROOT}/${relative}`;
  expect(existsSync(filePath)).toBe(true);
}

describe('clothes vertical config', () => {
  it('passes validateStoreConfig (required fields, unique product ids, categoryId integrity)', () => {
    expect(() => validateStoreConfig(clothesConfig)).not.toThrow();
  });

  it('reproduces the legacy brand name', () => {
    expect(clothesConfig.brand.name).toBe('Boutique Exclusiva');
  });

  it('has no duplicate product ids (regression: legacy reused ids 30/32)', () => {
    const ids = clothesConfig.catalog.products.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every product references a category that exists in the catalog', () => {
    const categoryIds = new Set(clothesConfig.catalog.categories.map((category) => category.id));
    for (const product of clothesConfig.catalog.products) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
    }
  });

  it('has a real, resolvable hero image asset (fixes legacy dead hero.backgroundImage bug)', () => {
    assertAssetExists(clothesConfig.hero.image);
  });

  it('every product image asset resolves to a real file under public/verticals/clothes/', () => {
    for (const product of clothesConfig.catalog.products) {
      assertAssetExists(product.image);
    }
  });

  it('ports a substantial catalog (legacy had 62 real, distinct product images)', () => {
    expect(clothesConfig.catalog.products.length).toBe(62);
    expect(clothesConfig.catalog.categories.length).toBe(17);
  });
});
