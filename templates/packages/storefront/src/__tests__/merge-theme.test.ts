import { describe, it, expect } from 'vitest';
import { mergeTheme } from '../theme/merge-theme';
import { DEFAULT_STORE_THEME } from '../theme/default-theme';
import { themeToCssVars } from '../theme/theme-to-css-vars';

describe('mergeTheme', () => {
  it('fills a vertical override that only sets primary color with every other default token', () => {
    const merged = mergeTheme(DEFAULT_STORE_THEME, { colors: { primary: '#112233' } });

    expect(merged.colors.primary).toBe('#112233');
    expect(merged.colors.secondary).toBe(DEFAULT_STORE_THEME.colors.secondary);
    expect(merged.typography).toEqual(DEFAULT_STORE_THEME.typography);
    expect(merged.radii).toEqual(DEFAULT_STORE_THEME.radii);

    const cssVars = themeToCssVars(merged);
    expect(cssVars['--color-primary']).toBe('#112233');
  });

  it('produces a CSS var map deep-equal to the default theme when the override is empty', () => {
    const merged = mergeTheme(DEFAULT_STORE_THEME, {});

    expect(themeToCssVars(merged)).toEqual(themeToCssVars(DEFAULT_STORE_THEME));
  });

  it('overrides a single radius token while keeping the rest of radii at default', () => {
    const merged = mergeTheme(DEFAULT_STORE_THEME, { radii: { pill: '4px' } });

    expect(merged.radii.pill).toBe('4px');
    expect(merged.radii.sm).toBe(DEFAULT_STORE_THEME.radii.sm);
    expect(merged.radii.md).toBe(DEFAULT_STORE_THEME.radii.md);
    expect(merged.radii.lg).toBe(DEFAULT_STORE_THEME.radii.lg);
  });
});
