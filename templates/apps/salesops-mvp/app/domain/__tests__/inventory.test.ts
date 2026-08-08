import { describe, expect, it } from 'vitest';
import {
  buildInventorySummary,
  filterInventoryRows,
  inventoryCategories,
  sortInventoryRows,
} from '../inventory';
import type { ProductStockRow } from '../inventory';
import type { InventoryEntry, SeedState, SeededProduct, Warehouse } from '../types';

function buildProduct(overrides: Partial<SeededProduct> = {}): SeededProduct {
  return {
    id: 'p-1',
    name: 'Producto 1',
    description: 'A fixture product.',
    price: 10,
    categoryId: 'cat-a',
    image: '/catalog/fixture/p1.jpg',
    commissionMN: 5,
    costUSD: 4,
    ...overrides,
  };
}

const warehouses: Warehouse[] = [
  { id: 'wh-1', name: 'Pinar del Río' },
  { id: 'wh-2', name: 'Consolación del Sur' },
];

function buildState(overrides: Partial<SeedState> = {}): SeedState {
  return {
    version: 1,
    generatedAt: '2024-01-01T00:00:00.000Z',
    products: [],
    warehouses,
    gestores: [],
    transportistas: [],
    inventory: [],
    exchangeRates: { usdToMn: 1, zelle: 1, eur: 1 },
    orders: [],
    ...overrides,
  };
}

describe('buildInventorySummary', () => {
  it('computes per-warehouse totalUnits/retailValueUSD/costValueUSD from a fixture', () => {
    const products: SeededProduct[] = [
      buildProduct({ id: 'p-1', name: 'Producto 1', price: 10, costUSD: 4, categoryId: 'cat-a' }),
      buildProduct({ id: 'p-2', name: 'Producto 2', price: 20, costUSD: 8, categoryId: 'cat-b' }),
    ];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 3 },
      { productId: 'p-2', warehouseId: 'wh-1', quantity: 2 },
      { productId: 'p-1', warehouseId: 'wh-2', quantity: 5 },
    ];
    const state = buildState({ products, inventory });

    const summary = buildInventorySummary(state);

    const wh1 = summary.warehouses.find((w) => w.warehouseId === 'wh-1')!;
    expect(wh1.totalUnits).toBe(5); // 3 + 2
    expect(wh1.retailValueUSD).toBe(70); // 10*3 + 20*2
    expect(wh1.costValueUSD).toBe(28); // 4*3 + 8*2

    const wh2 = summary.warehouses.find((w) => w.warehouseId === 'wh-2')!;
    expect(wh2.totalUnits).toBe(5);
    expect(wh2.retailValueUSD).toBe(50); // 10*5
    expect(wh2.costValueUSD).toBe(20); // 4*5
  });

  it('grand totals equal the sum across all warehouses', () => {
    const products: SeededProduct[] = [buildProduct({ id: 'p-1', price: 10, costUSD: 4 })];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 3 },
      { productId: 'p-1', warehouseId: 'wh-2', quantity: 5 },
    ];
    const state = buildState({ products, inventory });

    const summary = buildInventorySummary(state);

    expect(summary.totalUnits).toBe(8);
    expect(summary.totalRetailValueUSD).toBe(80);
    expect(summary.totalCostValueUSD).toBe(32);
  });

  it('marks status disponible for quantity > 0 and agotado for quantity === 0', () => {
    const products: SeededProduct[] = [
      buildProduct({ id: 'p-1', name: 'Con stock' }),
      buildProduct({ id: 'p-2', name: 'Sin stock' }),
    ];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 5 },
      { productId: 'p-2', warehouseId: 'wh-1', quantity: 0 },
    ];
    const state = buildState({ products, inventory });

    const summary = buildInventorySummary(state);
    const wh1 = summary.warehouses.find((w) => w.warehouseId === 'wh-1')!;

    const rowWithStock = wh1.rows.find((r) => r.productId === 'p-1')!;
    const rowWithoutStock = wh1.rows.find((r) => r.productId === 'p-2')!;
    expect(rowWithStock.status).toBe('disponible');
    expect(rowWithoutStock.status).toBe('agotado');
    // the zero-qty row is still included, contributing 0 to totals
    expect(wh1.rows).toHaveLength(2);
  });

  it('skips an inventory entry whose productId has no matching product, without throwing', () => {
    const products: SeededProduct[] = [buildProduct({ id: 'p-1', price: 10, costUSD: 4 })];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 3 },
      { productId: 'orphan-id', warehouseId: 'wh-1', quantity: 99 },
    ];
    const state = buildState({ products, inventory });

    expect(() => buildInventorySummary(state)).not.toThrow();
    const summary = buildInventorySummary(state);
    const wh1 = summary.warehouses.find((w) => w.warehouseId === 'wh-1')!;

    expect(wh1.rows.find((r) => r.productId === 'orphan-id')).toBeUndefined();
    expect(wh1.rows).toHaveLength(1);
    expect(wh1.totalUnits).toBe(3);
    expect(wh1.retailValueUSD).toBe(30);
    expect(wh1.costValueUSD).toBe(12);
  });

  it('sorts rows by categoryId then name (ascending)', () => {
    const products: SeededProduct[] = [
      buildProduct({ id: 'p-1', name: 'Zeta', categoryId: 'cat-b' }),
      buildProduct({ id: 'p-2', name: 'Alfa', categoryId: 'cat-a' }),
      buildProduct({ id: 'p-3', name: 'Beta', categoryId: 'cat-a' }),
    ];
    const inventory: InventoryEntry[] = [
      { productId: 'p-1', warehouseId: 'wh-1', quantity: 1 },
      { productId: 'p-2', warehouseId: 'wh-1', quantity: 1 },
      { productId: 'p-3', warehouseId: 'wh-1', quantity: 1 },
    ];
    const state = buildState({ products, inventory });

    const summary = buildInventorySummary(state);
    const wh1 = summary.warehouses.find((w) => w.warehouseId === 'wh-1')!;

    expect(wh1.rows.map((r) => r.name)).toEqual(['Alfa', 'Beta', 'Zeta']);
  });
});

describe('sortInventoryRows', () => {
  const rows: ProductStockRow[] = [
    { productId: 'p-1', name: 'Beta', categoryId: 'cat-b', quantity: 5, status: 'disponible' },
    { productId: 'p-2', name: 'Alfa', categoryId: 'cat-a', quantity: 0, status: 'agotado' },
    { productId: 'p-3', name: 'Gamma', categoryId: 'cat-a', quantity: 12, status: 'disponible' },
  ];

  it('sorts by name ascending and descending', () => {
    expect(sortInventoryRows(rows, 'name', 'asc').map((r) => r.name)).toEqual(['Alfa', 'Beta', 'Gamma']);
    expect(sortInventoryRows(rows, 'name', 'desc').map((r) => r.name)).toEqual(['Gamma', 'Beta', 'Alfa']);
  });

  it('sorts by quantity numerically, not lexicographically (12 after 5, not before)', () => {
    expect(sortInventoryRows(rows, 'quantity', 'asc').map((r) => r.quantity)).toEqual([0, 5, 12]);
    expect(sortInventoryRows(rows, 'quantity', 'desc').map((r) => r.quantity)).toEqual([12, 5, 0]);
  });

  it('sorts by categoryId and by status', () => {
    expect(sortInventoryRows(rows, 'categoryId', 'asc').map((r) => r.categoryId)).toEqual([
      'cat-a',
      'cat-a',
      'cat-b',
    ]);
    expect(sortInventoryRows(rows, 'status', 'asc').map((r) => r.status)).toEqual([
      'agotado',
      'disponible',
      'disponible',
    ]);
  });

  it('returns a new array without mutating the input', () => {
    const snapshot = rows.map((r) => ({ ...r }));
    const result = sortInventoryRows(rows, 'name', 'desc');
    expect(result).not.toBe(rows);
    expect(rows).toEqual(snapshot);
  });
});

describe('filterInventoryRows', () => {
  const rows: ProductStockRow[] = [
    { productId: 'p-1', name: 'Cafetera Express', categoryId: 'cafeteras', quantity: 5, status: 'disponible' },
    { productId: 'p-2', name: 'Olla a Presión', categoryId: 'ollas', quantity: 0, status: 'agotado' },
    { productId: 'p-3', name: 'Cafetera Italiana', categoryId: 'cafeteras', quantity: 3, status: 'disponible' },
  ];

  it('filters by name text, case-insensitively', () => {
    expect(filterInventoryRows(rows, { text: 'cafetera' }).map((r) => r.name)).toEqual([
      'Cafetera Express',
      'Cafetera Italiana',
    ]);
  });

  it('filters by exact categoryId', () => {
    expect(filterInventoryRows(rows, { categoryId: 'ollas' }).map((r) => r.name)).toEqual([
      'Olla a Presión',
    ]);
  });

  it('combines text AND category', () => {
    expect(filterInventoryRows(rows, { text: 'italiana', categoryId: 'cafeteras' }).map((r) => r.name)).toEqual([
      'Cafetera Italiana',
    ]);
  });

  it('returns all rows when the filter is empty', () => {
    expect(filterInventoryRows(rows, {})).toHaveLength(3);
    expect(filterInventoryRows(rows, { text: '  ', categoryId: '' })).toHaveLength(3);
  });
});

describe('inventoryCategories', () => {
  it('returns sorted, de-duplicated categoryIds', () => {
    const rows: ProductStockRow[] = [
      { productId: 'p-1', name: 'A', categoryId: 'ollas', quantity: 1, status: 'disponible' },
      { productId: 'p-2', name: 'B', categoryId: 'cafeteras', quantity: 1, status: 'disponible' },
      { productId: 'p-3', name: 'C', categoryId: 'ollas', quantity: 1, status: 'disponible' },
    ];
    expect(inventoryCategories(rows)).toEqual(['cafeteras', 'ollas']);
  });
});
