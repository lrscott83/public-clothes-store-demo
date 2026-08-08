import { describe, expect, it } from 'vitest';
import catalogData from '../../data/catalog.json';
import type { CatalogData } from '@store-mgmt/storefront/catalog';
import { enrichProducts } from '../enrich-products';
import { buildCommissionReviewTable, formatCommissionTableMarkdown } from '../review-table';

const catalog = catalogData as CatalogData;

describe('buildCommissionReviewTable', () => {
  it('returns exactly 99 rows with the required shape', () => {
    const products = enrichProducts(catalog);
    const rows = buildCommissionReviewTable(products);

    expect(rows).toHaveLength(99);
    for (const row of rows) {
      expect(row).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        price: expect.any(Number),
        costUSD: expect.any(Number),
        commissionMN: expect.any(Number),
        rule: expect.any(String),
      });
    }
  });

  it('flags category-default/catch-all fallback rows with a boolean flag', () => {
    const products = enrichProducts(catalog);
    const rows = buildCommissionReviewTable(products);

    const fallbackRows = rows.filter((row) => row.rule === 'category-default' || row.rule === 'catch-all');
    expect(fallbackRows.length).toBeGreaterThan(0);
    for (const row of fallbackRows) {
      expect(row.isFallback).toBe(true);
    }
    const keywordRows = rows.filter((row) => row.rule === 'keyword' || row.rule === 'bundle-sum');
    for (const row of keywordRows) {
      expect(row.isFallback).toBe(false);
    }
  });
});

describe('formatCommissionTableMarkdown', () => {
  it('renders a markdown table with a ⚠ marker on fallback rows', () => {
    const products = enrichProducts(catalog);
    const rows = buildCommissionReviewTable(products);
    const markdown = formatCommissionTableMarkdown(rows);

    expect(markdown).toContain('| id | name | category | price | costUSD | commissionMN | rule |');
    expect(markdown).toContain('⚠');

    const fallbackRow = rows.find((row) => row.isFallback);
    expect(fallbackRow).toBeDefined();
    expect(markdown).toContain(fallbackRow!.name);
  });
});
