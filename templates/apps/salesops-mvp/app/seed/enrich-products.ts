import type { CatalogData, StoreProduct } from '@store-mgmt/storefront/catalog';
import type { OrderItem, SeededProduct } from '../domain/types';
import { deriveCommission } from './commission-map';
import { resolveCatalogImage } from '../data/catalog';

/**
 * Pure enrichment step: adds frozen `commissionMN` + `costUSD` to every
 * catalog product. No PRNG, no side effects — same catalog in, same
 * `SeededProduct[]` out, always.
 */
export function enrichProducts(catalog: Pick<CatalogData, 'products'>): SeededProduct[] {
  return catalog.products.map((product: StoreProduct) => {
    const { commissionMN } = deriveCommission(product.name, product.categoryId);
    return {
      ...product,
      // catalog.json stores relative image paths (e.g. "products/..."); the
      // public/ folder mirrors them under catalog/appliances/products/...
      // Resolve through the app BASE_URL so images load under a non-root
      // subpath (e.g. GitHub Pages project pages) instead of 404ing off the
      // domain root with a hardcoded leading slash.
      image: resolveCatalogImage(product.image),
      costUSD: Math.round(product.price * 0.6),
      commissionMN,
    };
  });
}

/**
 * Order-level commission = sum of `item.commissionMN * item.quantity` across
 * the cart. Combo/quantity discount tiers are explicitly ignored (design.md).
 */
export function sumOrderCommission(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.commissionMN * item.quantity, 0);
}
