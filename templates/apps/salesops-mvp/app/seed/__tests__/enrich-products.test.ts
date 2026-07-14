import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogData from '../../data/catalog.json';
import type { CatalogData } from '@store-mgmt/storefront/catalog';
import { enrichProducts } from '../enrich-products';
import { deriveCommission } from '../commission-map';

const catalog = catalogData as CatalogData;

describe('enrichProducts', () => {
  it('computes costUSD = round(price * 0.60) for a sample product', () => {
    const [enriched] = enrichProducts({ products: [{ ...catalog.products[0], price: 15 }] });
    expect(enriched.costUSD).toBe(9); // round(15 * 0.6) = 9
  });

  it('freezes commissionMN per deriveCommission for every product', () => {
    const enriched = enrichProducts(catalog);
    for (const product of enriched) {
      const expected = deriveCommission(product.name, product.categoryId);
      expect(product.commissionMN).toBe(expected.commissionMN);
    }
  });

  it('runs over the full 99-product catalog and gives every product commissionMN > 0', () => {
    const enriched = enrichProducts(catalog);
    expect(enriched).toHaveLength(99);
    for (const product of enriched) {
      expect(product.commissionMN).toBeGreaterThan(0);
    }
  });
});

describe('enrichProducts — image URLs respect the app base path', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefixes product image URLs with the app BASE_URL so they load under a subpath', () => {
    // Simulate serving under a GitHub Pages project subpath.
    vi.stubEnv('BASE_URL', '/public-clothes-store-demo/salesops/');

    const [enriched] = enrichProducts({ products: [catalog.products[0]] });

    // A hardcoded leading-slash "/catalog/..." path ignores the base and 404s
    // off the domain root when the app is served from a subpath. The image must
    // be resolved against BASE_URL.
    expect(enriched.image).toBe(
      `/public-clothes-store-demo/salesops/catalog/appliances/${catalog.products[0].image}`,
    );
  });
});

describe('enrichProducts — 2026-07-08 business review corrections (real catalog rows)', () => {
  function byId(products: ReturnType<typeof enrichProducts>, id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error(`fixture catalog is missing product id ${id}`);
    return product;
  }

  it('gives the corrected accessory/cooktop products their new commissionMN', () => {
    const enriched = enrichProducts(catalog);

    expect(byId(enriched, '74').commissionMN).toBe(500); // Base Fija para TV
    expect(byId(enriched, '76').commissionMN).toBe(500); // Base para TV a la Pared Giratoria
    expect(byId(enriched, '75').commissionMN).toBe(1000); // Cajita HD para TV
    expect(byId(enriched, '8').commissionMN).toBe(1000); // Base para Split
    expect(byId(enriched, '11').commissionMN).toBe(2000); // Fogón de gas Rudenkov
    expect(byId(enriched, '12').commissionMN).toBe(2000); // Cocina de Inducción Milexus
    expect(byId(enriched, '14').commissionMN).toBe(2000); // Cocina infrarroja
  });

  it('recomputes the 3-segment "smart tv + cajita + base" bundles to 4500', () => {
    const enriched = enrichProducts(catalog);
    for (const id of ['77', '78', '80', '83', '84']) {
      expect(byId(enriched, id).commissionMN).toBe(4500);
    }
  });

  it('leaves the 2-segment "smart tv + base" bundles (no cajita) unchanged at 3500', () => {
    const enriched = enrichProducts(catalog);
    for (const id of ['81', '86']) {
      expect(byId(enriched, id).commissionMN).toBe(3500);
    }
  });

  it('does not disturb the other 92 products (spot-check unaffected keyword/category rows)', () => {
    const enriched = enrichProducts(catalog);
    expect(byId(enriched, '1').commissionMN).toBe(500); // Cafetera de fogón (keyword, unaffected)
    expect(byId(enriched, '41').commissionMN).toBe(3000); // Lavadora semi (keyword, unaffected)
    expect(byId(enriched, '51').commissionMN).toBe(1000); // Licuadora (category-default, unaffected)
    expect(byId(enriched, '7').commissionMN).toBe(3500); // Split 1T + Base (bundle, unaffected)
    expect(byId(enriched, '72').commissionMN).toBe(3000); // Smart TV 40 pulgadas (bare tv, unaffected)
  });
});
