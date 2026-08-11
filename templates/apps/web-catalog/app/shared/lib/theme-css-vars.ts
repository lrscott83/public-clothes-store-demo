import type { StoreThemeColors } from '../config/stores/types';

/** The exact `--color-*` custom property names `@store-mgmt/web-common`'s `styles.css` `@theme` block registers. */
const CSS_VAR_NAMES: Record<keyof StoreThemeColors, string> = {
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  primaryLight: '--color-primary-light',
  secondary: '--color-secondary',
  accent: '--color-accent',
  background: '--color-background',
  surface: '--color-surface',
  text: '--color-text',
  textMuted: '--color-text-muted',
  border: '--color-border',
  success: '--color-success',
  danger: '--color-danger',
  warning: '--color-warning',
  info: '--color-info',
};

/**
 * Rewritten from `packages/storefront/src/theme/theme-to-css-vars.ts`
 * (frozen, design.md D9 — never imported). Unlike the frozen version, this
 * only emits a var for a key the store's config actually overrides:
 * `web-common`'s own `@theme` block already bakes in a default for
 * everything else, so there is no "merge against `DEFAULT_STORE_THEME`" step
 * to reproduce here — `StoreConfig.theme.colors` (types.ts) is a genuinely
 * partial override, not a full theme.
 *
 * No DOM/window access — safe to call during SSR.
 */
export function themeColorsToCssVars(colors: Partial<StoreThemeColors> = {}): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key of Object.keys(colors) as (keyof StoreThemeColors)[]) {
    const value = colors[key];
    if (value) {
      result[CSS_VAR_NAMES[key]] = value;
    }
  }

  return result;
}
