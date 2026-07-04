import type { StoreConfig } from '@store-mgmt/storefront/config';
import { verticalAsset } from '@store-mgmt/storefront/config';
import catalogData from './catalog.json';

/**
 * The real `appliances` vertical — built from ~100 NOVA-reseller appliance
 * flyers (`assets/appliances/`) via the Stage A/B offline ETL pipeline (see
 * `openspec/changes/appliances-storefront/`). 74 published products across
 * 28 categories; source flyers are copied, never modified.
 *
 * Business copy (brand/nav/hero/product data) stays Spanish because it IS the
 * vertical's authored data (Cuban/Pinar del Río market), mirroring the
 * `clothes` vertical's convention — distinct from generic UI chrome, which
 * stays English.
 *
 * D6 (resolved): brand is "NOVA Electrodomésticos" (user-confirmed). Hero is a
 * free-license Pexels photo (modern kitchen with stainless appliances) —
 * https://www.pexels.com/photo/15409513/ , Pexels License (free commercial
 * use, no attribution required); stored locally at public/verticals/appliances/hero.jpg.
 */

// `catalog.json` stores vertical-relative asset keys (e.g.
// "products/neveras/neveras1.jpeg"), resolved here via `verticalAsset` so the
// URLs stay base-path aware (threads `VITE_BASE` through
// `import.meta.env.BASE_URL`) — never hardcoded absolute paths in the JSON.
const catalog = {
  categories: catalogData.categories,
  products: catalogData.products.map((product) => ({
    ...product,
    image: verticalAsset('appliances', product.image),
  })),
};

export const appliancesConfig: StoreConfig = {
  vertical: 'appliances',
  brand: {
    name: 'NOVA Electrodomésticos',
    tagline: 'Electrodomésticos y energía para tu hogar',
    copyright: '© 2026 NOVA Electrodomésticos. Todos los derechos reservados.',
  },
  locale: 'en-US',
  currency: 'USD',
  theme: {
    // Steel-blue palette suited to an appliances/electronics storefront;
    // primaryHover/primaryLight derived so hover states and tinted surfaces
    // stay consistent. Remaining tokens fall back to DEFAULT_STORE_THEME.
    colors: {
      primary: 'rgb(37 99 235)',
      primaryHover: 'rgb(29 78 216)',
      primaryLight: 'rgb(219 234 254)',
      secondary: 'rgb(15 23 42)',
      accent: 'rgb(37 99 235)',
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
    alt: 'NOVA Electrodomésticos',
  },
  hero: {
    image: verticalAsset('appliances', 'hero.jpg'),
    heading: 'Electrodomésticos de Calidad a Precios Increíbles',
    subheading: 'Neveras, televisores, energía solar y más para tu hogar',
    ctaLabel: 'Ver Productos',
    ctaPath: '/productos',
  },
  nav: [
    { label: 'Inicio', path: '/', kind: 'route' },
    { label: 'Características', path: '#caracteristicas', kind: 'anchor' },
    { label: 'Ofertas', path: '#ofertas', kind: 'anchor' },
    { label: 'Novedades', path: '#novedades', kind: 'anchor' },
    { label: 'Productos', path: '/productos', kind: 'route' },
  ],
  features: [
    {
      icon: 'Star',
      title: 'Productos Garantizados',
      description: 'Electrodomésticos con garantía respaldada',
    },
    {
      icon: 'Shield',
      title: 'Pago Seguro',
      description: 'Transacciones 100% seguras',
    },
    {
      icon: 'Truck',
      title: 'Entrega a Domicilio',
      description: 'Coordinamos la entrega de tu compra',
    },
    {
      icon: 'Package',
      title: 'Soporte Postventa',
      description: 'Acompañamiento después de tu compra',
    },
  ],
  footer: {
    linkGroups: [
      {
        title: 'Tienda',
        links: [{ label: 'Productos', path: '/productos', kind: 'route' }],
      },
    ],
    contact: 'contacto@novaelectrodomesticos.com',
    copyright: '© 2026 NOVA Electrodomésticos. Todos los derechos reservados.',
  },
  catalog,
};
