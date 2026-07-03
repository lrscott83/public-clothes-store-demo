import type { StoreConfig } from '@store-mgmt/storefront/config';
import { verticalAsset } from '@store-mgmt/storefront/config';
import catalogData from './catalog.json';

/**
 * The real `clothes` vertical — ported from the legacy Nicaraguan storefront
 * (`src/`, read-only reference; see apply-progress for the full port
 * rationale). Replaces the Slice 2 MINIMAL placeholder.
 *
 * Content stays Spanish (brand/nav/hero/product copy) because it IS the
 * vertical's authored business data, faithfully ported from the legacy
 * store — this is distinct from structural UI chrome (aria-labels, empty
 * states, section headings), which stays English per the template's
 * generic-chrome convention (see Slice 3 apply-progress Deviation 5).
 */

// `catalog.json` stores vertical-relative asset keys (e.g.
// "products/camisas/camisa1.jpg"), resolved here via `verticalAsset` so the
// resulting URLs stay base-path aware (Phase 10 threads `VITE_BASE` through
// `import.meta.env.BASE_URL`, which `verticalAsset` already reads by
// default) — never hardcoded absolute paths in the JSON itself.
const catalog = {
  categories: catalogData.categories,
  products: catalogData.products.map((product) => ({
    ...product,
    image: verticalAsset('clothes', product.image),
  })),
};

export const clothesConfig: StoreConfig = {
  vertical: 'clothes',
  brand: {
    name: 'Boutique Exclusiva',
    tagline: 'Moda exclusiva para tu estilo de vida',
    copyright: '© 2026 Boutique Exclusiva. Todos los derechos reservados.',
  },
  locale: 'en-US',
  currency: 'USD',
  theme: {
    // Ported from the legacy store's default theme (`ThemeContext.tsx`'s
    // `light` palette — the theme the app actually boots into, despite its
    // name). Tokens not present in the legacy palette (primaryHover,
    // primaryLight, success/warning/info) fall back to
    // `DEFAULT_STORE_THEME`; primaryHover/primaryLight are derived here so
    // hover states and tinted surfaces don't clash with the ported red
    // primary.
    colors: {
      primary: 'rgb(239 68 68)',
      primaryHover: 'rgb(220 38 38)',
      primaryLight: 'rgb(254 226 226)',
      secondary: 'rgb(99 102 241)',
      accent: 'rgb(239 68 68)',
      background: 'rgb(249 250 251)',
      surface: 'rgb(255 255 255)',
      text: 'rgb(17 24 39)',
      textMuted: 'rgb(107 114 128)',
      border: 'rgb(229 231 235)',
    },
  },
  logo: {
    icon: 'Store',
    tintToken: 'primary',
    alt: 'Boutique Exclusiva',
  },
  hero: {
    image: verticalAsset('clothes', 'hero.jpg'),
    heading: 'Descubre Productos Exclusivos a Precios Increíbles',
    subheading: 'Calidad excepcional y variedad incomparable para tu estilo de vida',
    ctaLabel: 'Ver Productos',
    ctaPath: '/productos',
  },
  nav: [
    { label: 'Inicio', path: '/', kind: 'route' },
    { label: 'Productos', path: '/productos', kind: 'route' },
  ],
  features: [
    {
      icon: 'Star',
      title: 'Colecciones Seleccionadas',
      description: 'Productos cuidadosamente elegidos para ti',
    },
    {
      icon: 'Shield',
      title: 'Pago Seguro',
      description: 'Transacciones 100% seguras',
    },
    {
      icon: 'Truck',
      title: 'Envío Gratis',
      description: 'En compras mayores a $50',
    },
    {
      icon: 'Package',
      title: 'Devolución Garantizada',
      description: '30 días de garantía',
    },
  ],
  footer: {
    linkGroups: [
      {
        title: 'Tienda',
        links: [{ label: 'Productos', path: '/productos', kind: 'route' }],
      },
    ],
    contact: 'contacto@boutiqueexclusiva.com',
    copyright: '© 2026 Boutique Exclusiva. Todos los derechos reservados.',
  },
  catalog,
};
