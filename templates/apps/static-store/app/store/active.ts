import { resolveVertical, validateStoreConfig, DEFAULT_VERTICAL } from '@store-mgmt/storefront/config';
import { createBakedCatalogProvider } from '@store-mgmt/storefront/catalog';
import { mergeTheme, DEFAULT_STORE_THEME } from '@store-mgmt/storefront/theme';
import { VERTICALS } from './verticals';

const activeVertical = resolveVertical(
  VERTICALS,
  import.meta.env.VITE_STORE_VERTICAL,
  DEFAULT_VERTICAL,
);

/** The active vertical's validated `StoreConfig`. Throws at build/dev time if invalid. */
export const activeConfig = validateStoreConfig(activeVertical.config);

/** The active vertical's theme, merged against the baked default. */
export const activeTheme = mergeTheme(DEFAULT_STORE_THEME, activeConfig.theme);

/** Sync, baked-JSON catalog provider for the active vertical. */
export const catalog = createBakedCatalogProvider(activeConfig.catalog);
