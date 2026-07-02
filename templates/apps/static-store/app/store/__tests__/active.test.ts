import { describe, it, expect } from 'vitest';
import { activeConfig, activeTheme, catalog } from '../active';

// VITE_STORE_VERTICAL is unset in the test env, so this exercises the
// documented default-vertical fallback (resolveVertical -> DEFAULT_VERTICAL).
describe('active vertical resolution', () => {
  it('resolves a valid StoreConfig for the default (clothes) vertical', () => {
    expect(activeConfig.vertical).toBe('clothes');
    expect(activeConfig.brand.name).toBeTruthy();
  });

  it('produces a fully-merged theme with defaults filled in for un-overridden tokens', () => {
    expect(activeTheme.colors.primary).toBeTruthy();
    expect(activeTheme.typography.fontFamily).toBeTruthy();
    expect(activeTheme.radii.md).toBeTruthy();
  });

  it('creates a working catalog provider from the active config', () => {
    expect(catalog.getCategories().length).toBeGreaterThan(0);
    expect(catalog.getProducts().length).toBeGreaterThan(0);
  });
});
