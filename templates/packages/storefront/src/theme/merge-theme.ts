import type { StoreTheme, PartialStoreTheme } from './types';

/**
 * Deep-merges a per-vertical partial theme override on top of a base theme.
 * Any token missing from `override` falls back to `base`'s value. Pure —
 * returns a new object, never mutates either argument.
 */
export function mergeTheme(base: StoreTheme, override: PartialStoreTheme): StoreTheme {
  return {
    colors: { ...base.colors, ...override.colors },
    typography: { ...base.typography, ...override.typography },
    radii: { ...base.radii, ...override.radii },
  };
}
