import { createContext, useContext, type ReactNode } from 'react';
import type { StoreTheme } from './types';
import type { StoreConfig } from '../config/types';
import { themeToCssVars } from './theme-to-css-vars';

export interface StoreThemeContextValue {
  /** Fully-resolved theme (already merged against `DEFAULT_STORE_THEME`). */
  theme: StoreTheme;
  /** Active vertical's resolved config, so consumers avoid prop-drilling. */
  config: StoreConfig;
}

const StoreThemeContext = createContext<StoreThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  theme: StoreTheme;
  config: StoreConfig;
  children: ReactNode;
}

/**
 * Applies the active vertical's theme as CSS custom properties by rendering
 * an inline `<style>` element in JSX — never via
 * `document.documentElement.style.setProperty`. This makes the variables
 * part of the (pre)rendered HTML output, so it works identically during a
 * Node prerender pass and in the browser, with zero `window`/`document`
 * access performed by this component itself.
 */
export function ThemeProvider({ theme, config, children }: ThemeProviderProps) {
  const cssVars = themeToCssVars(theme);
  const declarations = Object.entries(cssVars)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const css = `:root { ${declarations} }`;

  return (
    <StoreThemeContext.Provider value={{ theme, config }}>
      {/* eslint-disable-next-line react/no-danger -- trusted, internally-generated CSS text, not user input */}
      <style data-store-theme dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </StoreThemeContext.Provider>
  );
}

/** Returns the active theme and config. Must be used within a `ThemeProvider`. */
export function useStoreTheme(): StoreThemeContextValue {
  const context = useContext(StoreThemeContext);

  if (!context) {
    throw new Error('useStoreTheme must be used within a ThemeProvider');
  }

  return context;
}
