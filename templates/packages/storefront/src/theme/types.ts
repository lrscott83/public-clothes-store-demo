export interface StoreThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
}

export interface StoreThemeTypography {
  fontFamily: string;
  headingFontFamily?: string;
  fontSizeBase: string;
  fontSizeSm: string;
  fontSizeLg: string;
}

export interface StoreThemeRadii {
  sm: string;
  md: string;
  lg: string;
  pill: string;
}

export interface StoreTheme {
  colors: StoreThemeColors;
  typography: StoreThemeTypography;
  radii: StoreThemeRadii;
}

/**
 * Per-vertical theme override. Every group and every token inside it is
 * optional — `mergeTheme` fills anything missing from the baked default.
 */
export interface PartialStoreTheme {
  colors?: Partial<StoreThemeColors>;
  typography?: Partial<StoreThemeTypography>;
  radii?: Partial<StoreThemeRadii>;
}
