import { describe, it, expect } from 'vitest';
import { themeColorsToCssVars } from './theme-css-vars';

/**
 * Rewritten from `packages/storefront/src/theme/theme-to-css-vars.ts`
 * (frozen, design.md D9) — only emits vars for keys the store's config
 * actually overrides, since web-common's own `@theme` block already bakes
 * in a default for everything else.
 */
describe('themeColorsToCssVars', () => {
  it('maps overridden colour keys to their web-common CSS var names', () => {
    const result = themeColorsToCssVars({ primary: 'rgb(1 2 3)', accent: 'rgb(4 5 6)' });

    expect(result).toEqual({
      '--color-primary': 'rgb(1 2 3)',
      '--color-accent': 'rgb(4 5 6)',
    });
  });

  it('emits nothing for an empty override', () => {
    expect(themeColorsToCssVars({})).toEqual({});
  });

  it('emits nothing when called with no argument', () => {
    expect(themeColorsToCssVars()).toEqual({});
  });

  it('covers every StoreThemeColors key with the correct --color-* name', () => {
    const result = themeColorsToCssVars({
      primary: 'a',
      primaryHover: 'b',
      primaryLight: 'c',
      secondary: 'd',
      accent: 'e',
      background: 'f',
      surface: 'g',
      text: 'h',
      textMuted: 'i',
      border: 'j',
      success: 'k',
      danger: 'l',
      warning: 'm',
      info: 'n',
    });

    expect(result).toEqual({
      '--color-primary': 'a',
      '--color-primary-hover': 'b',
      '--color-primary-light': 'c',
      '--color-secondary': 'd',
      '--color-accent': 'e',
      '--color-background': 'f',
      '--color-surface': 'g',
      '--color-text': 'h',
      '--color-text-muted': 'i',
      '--color-border': 'j',
      '--color-success': 'k',
      '--color-danger': 'l',
      '--color-warning': 'm',
      '--color-info': 'n',
    });
  });
});
