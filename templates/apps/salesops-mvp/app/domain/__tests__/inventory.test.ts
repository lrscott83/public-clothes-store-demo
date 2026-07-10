import { describe, expect, it } from 'vitest';
import { buildInventorySummary } from '../inventory';
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
