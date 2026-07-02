import type { StoreConfig } from '@store-mgmt/storefront/config';
import { verticalAsset } from '@store-mgmt/storefront/config';

/**
 * MINIMAL placeholder `clothes` vertical config.
 *
 * This is intentionally NOT the full legacy-parity storefront — it exists
 * only so the app builds/prerenders and `ThemeProvider` mounts in this
 * slice. Slice 4 (tasks.md Phase 8) replaces this with the full ported
 * catalog (16 categories, real products with unique ids), a real hero/logo,
 * and assets under `public/verticals/clothes/`.
 */
export const clothesConfig: StoreConfig = {
  vertical: 'clothes',
  brand: {
    name: 'Boutique Exclusiva',
    copyright: '© Boutique Exclusiva',
  },
  locale: 'es-NI',
  currency: 'NIO',
  theme: {
    colors: {
      primary: 'rgb(103 58 183)',
    },
  },
  logo: {
    icon: 'ShoppingBag',
    alt: 'Boutique Exclusiva',
  },
  hero: {
    image: verticalAsset('clothes', 'hero.jpg'),
    heading: 'Boutique Exclusiva',
    subheading: 'Moda para toda ocasion',
  },
  nav: [{ label: 'Inicio', path: '/', kind: 'route' }],
  footer: {
    copyright: '© Boutique Exclusiva',
  },
  catalog: {
    categories: [{ id: 'placeholder', name: 'Placeholder' }],
    products: [
      {
        id: 'placeholder-1',
        name: 'Placeholder product',
        description: 'Placeholder data — replaced with the full clothes catalog in Slice 4.',
        price: 0,
        categoryId: 'placeholder',
        image: verticalAsset('clothes', 'placeholder.jpg'),
      },
    ],
  },
};
