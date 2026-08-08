import { describe, it, expect, vi } from 'vitest';
import { themeToCssVars } from '../theme/theme-to-css-vars';
import type { StoreTheme } from '../theme/types';

const sampleTheme: StoreTheme = {
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
    fontFamily: 'Inter, sans-serif',
    headingFontFamily: 'Poppins, sans-serif',
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

describe('themeToCssVars', () => {
  it('maps every token to its exact web-common CSS var name', () => {
    const result = themeToCssVars(sampleTheme);

    expect(result).toEqual({
      '--color-primary': 'rgb(103 58 183)',
      '--color-primary-hover': 'rgb(94 53 177)',
      '--color-primary-light': 'rgb(237 231 246)',
      '--color-secondary': 'rgb(22 119 255)',
      '--color-accent': 'rgb(250 173 20)',
      '--color-background': 'rgb(245 245 245)',
      '--color-surface': 'rgb(255 255 255)',
      '--color-text': 'rgb(20 20 20)',
      '--color-text-muted': 'rgb(140 140 140)',
      '--color-border': 'rgb(240 240 240)',
      '--color-success': 'rgb(82 196 26)',
      '--color-danger': 'rgb(255 77 79)',
      '--color-warning': 'rgb(250 173 20)',
      '--color-info': 'rgb(22 119 255)',
      '--font-family': 'Inter, sans-serif',
      '--font-family-heading': 'Poppins, sans-serif',
      '--font-size-base': '0.875rem',
      '--font-size-sm': '0.765625rem',
      '--font-size-lg': '1.09375rem',
      '--radius-sm': '2px',
      '--radius-md': '4px',
      '--radius-lg': '6px',
      '--radius-pill': '9999px',
    });
  });

  it('falls back --font-family-heading to fontFamily when headingFontFamily is omitted', () => {
    const themeWithoutHeadingFont: StoreTheme = {
      ...sampleTheme,
      typography: { ...sampleTheme.typography, headingFontFamily: undefined },
    };

    const result = themeToCssVars(themeWithoutHeadingFont);

    expect(result['--font-family-heading']).toBe('Inter, sans-serif');
  });

  it('is pure: two calls with equal input produce deep-equal output and never touch the DOM', () => {
    const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');

    const first = themeToCssVars(sampleTheme);
    const second = themeToCssVars(sampleTheme);

    expect(first).toEqual(second);
    expect(setPropertySpy).not.toHaveBeenCalled();

    setPropertySpy.mockRestore();
  });
});
