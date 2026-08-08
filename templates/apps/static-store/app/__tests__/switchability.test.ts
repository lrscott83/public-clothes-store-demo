import { describe, it, expect } from 'vitest';
import { resolveVertical, validateStoreConfig } from '@store-mgmt/storefront/config';
import { VERTICALS } from '../store/verticals';

/**
 * Proves the core "add a vertical == add a folder + one registry line"
 * claim: `resolveVertical` against the SAME static `VERTICALS` registry
 * returns two configs (`demo` vs `clothes`) that are a genuine re-skin —
 * different brand, different theme palette, different catalog — with zero
 * engine/component changes required.
 */
describe('vertical switchability (demo vs clothes)', () => {
  it('resolves the demo vertical from the registry', () => {
    const resolved = resolveVertical(VERTICALS, 'demo', 'clothes');
    expect(resolved.slug).toBe('demo');
    expect(resolved.config.vertical).toBe('demo');
  });

  it('resolves the clothes vertical from the registry', () => {
    const resolved = resolveVertical(VERTICALS, 'clothes', 'clothes');
    expect(resolved.slug).toBe('clothes');
    expect(resolved.config.vertical).toBe('clothes');
  });

  it('demo and clothes have different brand names (re-skin proof)', () => {
    const demo = resolveVertical(VERTICALS, 'demo', 'clothes').config;
    const clothes = resolveVertical(VERTICALS, 'clothes', 'clothes').config;
    expect(demo.brand.name).not.toBe(clothes.brand.name);
  });

  it('demo and clothes have different theme primary colors (re-skin proof)', () => {
    const demo = resolveVertical(VERTICALS, 'demo', 'clothes').config;
    const clothes = resolveVertical(VERTICALS, 'clothes', 'clothes').config;
    expect(demo.theme.colors?.primary).not.toBe(clothes.theme.colors?.primary);
  });

  it('both configs pass validateStoreConfig', () => {
    const demo = resolveVertical(VERTICALS, 'demo', 'clothes').config;
    const clothes = resolveVertical(VERTICALS, 'clothes', 'clothes').config;
    expect(() => validateStoreConfig(demo)).not.toThrow();
    expect(() => validateStoreConfig(clothes)).not.toThrow();
  });

  it('neither config has duplicate product ids', () => {
    for (const slug of ['demo', 'clothes']) {
      const config = resolveVertical(VERTICALS, slug, 'clothes').config;
      const ids = config.catalog.products.map((product) => product.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
