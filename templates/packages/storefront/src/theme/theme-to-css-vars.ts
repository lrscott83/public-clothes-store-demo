import type { StoreTheme } from './types';

/**
 * Pure mapping from a fully-resolved `StoreTheme` to the exact CSS custom
 * property names registered by `@store-mgmt/web-common`'s `@theme` block
 * (`--color-*`, `--radius-*`, `--font-size-*`), plus two new tokens
 * (`--font-family`, `--font-family-heading`) not defined in web-common.
 *
 * No DOM/window/localStorage access — safe to call during prerender.
 */
export function themeToCssVars(theme: StoreTheme): Record<string, string> {
  const { colors, typography, radii } = theme;

  return {
    '--color-primary': colors.primary,
    '--color-primary-hover': colors.primaryHover,
    '--color-primary-light': colors.primaryLight,
    '--color-secondary': colors.secondary,
    '--color-accent': colors.accent,
    '--color-background': colors.background,
    '--color-surface': colors.surface,
    '--color-text': colors.text,
    '--color-text-muted': colors.textMuted,
    '--color-border': colors.border,
    '--color-success': colors.success,
    '--color-danger': colors.danger,
    '--color-warning': colors.warning,
    '--color-info': colors.info,
    '--font-family': typography.fontFamily,
    '--font-family-heading': typography.headingFontFamily ?? typography.fontFamily,
    '--font-size-base': typography.fontSizeBase,
    '--font-size-sm': typography.fontSizeSm,
    '--font-size-lg': typography.fontSizeLg,
    '--radius-sm': radii.sm,
    '--radius-md': radii.md,
    '--radius-lg': radii.lg,
    '--radius-pill': radii.pill,
  };
}
