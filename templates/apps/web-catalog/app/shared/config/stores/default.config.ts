import type { StoreConfig } from './types';

/**
 * The seeded "default" tenant's branding (design.md D9 — a static map, one
 * entry per provisioned slug, resolved by `getStoreConfig`). Every catalog
 * fact (products, categories) comes from `api-public` at request time; this
 * file owns only presentation — brand, theme, nav, hero, footer copy.
 */
export const defaultStoreConfig: StoreConfig = {
  slug: 'default',
  brand: {
    name: 'Urbana Ropa',
    tagline: 'Moda urbana para cada día',
    copyright: '© 2026 Urbana Ropa. Todos los derechos reservados.',
  },
  locale: 'es-AR',
  theme: {
    colors: {
      primary: 'rgb(190 24 93)',
      primaryHover: 'rgb(157 23 77)',
      primaryLight: 'rgb(253 224 236)',
      accent: 'rgb(217 70 239)',
    },
  },
  logo: {
    icon: 'ShoppingBag',
    tintToken: 'primary',
    alt: 'Urbana Ropa',
  },
  hero: {
    heading: 'Vestí tu estilo',
    subheading: 'Descubrí la nueva colección de temporada, siempre a un click.',
    ctaLabel: 'Ver productos',
    ctaPath: '/productos',
  },
  nav: [
    { label: 'Inicio', path: '/', kind: 'route' },
    { label: 'Productos', path: '/productos', kind: 'route' },
  ],
  footer: {
    linkGroups: [
      {
        title: 'Tienda',
        links: [{ label: 'Productos', path: '/productos', kind: 'route' }],
      },
    ],
    contact: 'contacto@urbana-ropa.test',
    copyright: '© 2026 Urbana Ropa. Todos los derechos reservados.',
  },
};
