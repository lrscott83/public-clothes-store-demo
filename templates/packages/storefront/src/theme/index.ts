// Pure theme engine (no React): types, default theme, merge, CSS var mapping.
export * from './types';
export * from './default-theme';
export * from './merge-theme';
export * from './theme-to-css-vars';

// React layer: ThemeProvider renders the resolved theme as CSS custom
// properties via an inline <style> element; useStoreTheme exposes the
// active theme/config to descendants.
export * from './theme-provider';
