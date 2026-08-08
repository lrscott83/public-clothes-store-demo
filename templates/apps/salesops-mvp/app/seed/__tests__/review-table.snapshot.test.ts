import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalogData from '../../data/catalog.json';
import type { CatalogData } from '@store-mgmt/storefront/catalog';
import { enrichProducts } from '../enrich-products';
import { buildCommissionReviewTable, formatReviewTableDocument } from '../review-table';

const catalog = catalogData as CatalogData;
const snapshotPath = resolve(process.cwd(), 'app/seed/__snapshots__/commission-table.md');

describe('commission review table snapshot', () => {
  it('matches the committed app/seed/__snapshots__/commission-table.md', () => {
    const products = enrichProducts(catalog);
    const rows = buildCommissionReviewTable(products);
    const generated = formatReviewTableDocument(rows);
    const committed = readFileSync(snapshotPath, 'utf-8');

    expect(generated).toBe(committed);
  });
});
