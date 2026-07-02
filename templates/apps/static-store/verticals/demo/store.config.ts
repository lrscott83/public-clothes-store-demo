import type { StoreConfig } from '@store-mgmt/storefront/config';
import { verticalAsset } from '@store-mgmt/storefront/config';
import catalogData from './catalog.json';

/**
 * The `demo` vertical — a SECOND, intentionally minimal vertical whose sole
 * purpose is to prove `VITE_STORE_VERTICAL` switching actually re-skins the
 * storefront (brand, theme palette, copy, catalog) with a registry-only
 * diff and zero engine changes. It is NOT a real store; assets are reused
 * placeholder images (see `public/verticals/demo/`), and content is
 * intentionally generic/English (unlike the Spanish, business-authored
 * `clothes` vertical) to make the "this is just a demo" framing obvious.
 *
 * Deliberately DIFFERENT from `clothes` on every axis the switchability
 * test checks: brand name, theme.colors.primary (blue vs red), locale +
 * currency (en-US/USD vs es-NI/NIO), and catalog contents.
 */

// Same convention as `clothes/store.config.ts`: `catalog.json` stores
// vertical-relative asset keys, resolved here via `verticalAsset` so URLs
// stay base-path aware.
const catalog = {
  categories: catalogData.categories,
  products: catalogData.products.map((product) => ({
    ...product,
    image: verticalAsset('demo', product.image),
  })),
};

export const demoConfig: StoreConfig = {
  vertical: 'demo',
  brand: {
    name: 'Demo Store',
    tagline: 'A live example of the theming engine, not a real shop',
    copyright: '© 2026 Demo Store. All rights reserved.',
  },
  locale: 'en-US',
  currency: 'USD',
  theme: {
    // Intentionally a completely different palette from `clothes` (red) —
    // this is the core "re-skin" proof: blue primary vs. red primary.
    colors: {
      primary: 'rgb(37 99 235)',
      primaryHover: 'rgb(29 78 216)',
      primaryLight: 'rgb(219 234 254)',
      secondary: 'rgb(16 185 129)',
      accent: 'rgb(249 115 22)',
      background: 'rgb(248 250 252)',
      surface: 'rgb(255 255 255)',
      text: 'rgb(15 23 42)',
      textMuted: 'rgb(100 116 139)',
      border: 'rgb(226 232 240)',
    },
  },
  logo: {
    icon: 'ShoppingBag',
    tintToken: 'primary',
    alt: 'Demo Store',
  },
  hero: {
    image: verticalAsset('demo', 'hero.jpg'),
    heading: 'This Is a Themeable Storefront Demo',
    subheading: 'Same engine, same components, completely different brand and catalog.',
    ctaLabel: 'Browse Demo Products',
    ctaPath: '/productos',
  },
  nav: [
    { label: 'Home', path: '/', kind: 'route' },
    { label: 'Products', path: '/productos', kind: 'route' },
  ],
  footer: {
    linkGroups: [
      {
        title: 'Shop',
        links: [{ label: 'Products', path: '/productos', kind: 'route' }],
      },
    ],
    contact: 'hello@demo-store.example',
    copyright: '© 2026 Demo Store. All rights reserved.',
  },
  catalog,
};
