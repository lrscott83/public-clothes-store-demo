import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider, useStoreTheme } from '../theme/theme-provider';
import { DEFAULT_STORE_THEME } from '../theme/default-theme';
import { mergeTheme } from '../theme/merge-theme';
import { themeToCssVars } from '../theme/theme-to-css-vars';
import type { StoreConfig } from '../config/types';

const theme = mergeTheme(DEFAULT_STORE_THEME, { colors: { primary: '#112233' } });

function makeConfig(): StoreConfig {
  return {
    vertical: 'clothes',
    brand: { name: 'Boutique Exclusiva', copyright: '(c) Boutique Exclusiva' },
    locale: 'es-NI',
    currency: 'NIO',
    theme: { colors: { primary: '#112233' } },
    logo: { alt: 'Boutique Exclusiva logo' },
    hero: { image: '/hero.jpg', heading: 'Welcome', subheading: 'New season' },
    nav: [{ label: 'Home', path: '/', kind: 'route' }],
    footer: { copyright: '(c) Boutique Exclusiva' },
    catalog: {
      categories: [{ id: 'cat-tops', name: 'Tops' }],
      products: [
        {
          id: 'p1',
          name: 'Blue Shirt',
          description: 'A blue shirt',
          price: 25,
          categoryId: 'cat-tops',
          image: '/blue-shirt.jpg',
        },
      ],
    },
  };
}

function ThemeConsumer() {
  const { theme: activeTheme, config } = useStoreTheme();
  return (
    <div>
      <span data-testid="primary">{activeTheme.colors.primary}</span>
      <span data-testid="vertical">{config.vertical}</span>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('renders an inline <style> element with the expected CSS custom properties', () => {
    const { container } = render(
      <ThemeProvider theme={theme} config={makeConfig()}>
        <div>child</div>
      </ThemeProvider>,
    );

    const styleEl = container.querySelector('style[data-store-theme]');
    expect(styleEl).not.toBeNull();

    const cssVars = themeToCssVars(theme);
    for (const [name, value] of Object.entries(cssVars)) {
      expect(styleEl!.textContent).toContain(`${name}: ${value};`);
    }
  });

  it('renders its children', () => {
    render(
      <ThemeProvider theme={theme} config={makeConfig()}>
        <div>hello child</div>
      </ThemeProvider>,
    );

    expect(screen.getByText('hello child')).toBeInTheDocument();
  });

  it('renders to a static markup string without throwing (prerender-safe, no window/document access outside JSX)', () => {
    expect(() =>
      renderToStaticMarkup(
        <ThemeProvider theme={theme} config={makeConfig()}>
          <div>prerendered</div>
        </ThemeProvider>,
      ),
    ).not.toThrow();
  });

  it('useStoreTheme inside a provider returns the active theme and config', () => {
    render(
      <ThemeProvider theme={theme} config={makeConfig()}>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('primary').textContent).toBe('#112233');
    expect(screen.getByTestId('vertical').textContent).toBe('clothes');
  });

  it('useStoreTheme outside a provider throws a descriptive error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<ThemeConsumer />)).toThrow(
      'useStoreTheme must be used within a ThemeProvider',
    );

    consoleErrorSpy.mockRestore();
  });
});
