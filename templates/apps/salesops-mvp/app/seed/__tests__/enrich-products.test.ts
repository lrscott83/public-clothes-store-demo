import { describe, expect, it } from 'vitest';
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
