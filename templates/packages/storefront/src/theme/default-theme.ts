import type { StoreTheme } from './types';

/**
 * Baked default theme. Mirrors `@store-mgmt/web-common`'s `styles.css`
 * `@theme` literal values so a vertical that supplies no override (or a
 * partial override) still renders with sensible, already-tested tokens.
 */
export const DEFAULT_STORE_THEME: StoreTheme = {
  colors: {
    primary: 'rgb(103 58 183)',
    primaryHover: 'rgb(94 53 177)',
    primaryLight: 'rgb(237 231 246)',
    secondary: 'rgb(22 119 255)',
    accent: 'rgb(250 173 20)',
    background: 'rgb(245 245 245)',
    surface: 'rgb(255 255 255)',
    text: 'rgb(20 20 20)',
    textMuted: 'rgb(140 140 140)',
    border: 'rgb(240 240 240)',
    success: 'rgb(82 196 26)',
    danger: 'rgb(255 77 79)',
    warning: 'rgb(250 173 20)',
    info: 'rgb(22 119 255)',
  },
  typography: {
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSizeBase: '0.875rem',
    fontSizeSm: '0.765625rem',
    fontSizeLg: '1.09375rem',
  },
  radii: {
    sm: '2px',
    md: '4px',
    lg: '6px',
    pill: '9999px',
  },
};
