import type { SeedState } from './types';

export type StockStatus = 'disponible' | 'agotado';

export interface ProductStockRow {
  productId: string;
  name: string;
  categoryId: string; // raw categoryId — SeedState carries no category-name map
  quantity: number;
  status: StockStatus;
}

export interface WarehouseInventory {
  warehouseId: string;
  warehouseName: string;
  totalUnits: number; // Σ quantity
  retailValueUSD: number; // Σ product.price * quantity ("valor de venta")
  costValueUSD: number; // Σ product.costUSD * quantity ("valor de costo")
  rows: ProductStockRow[]; // sorted by categoryId then name
}

export type InventorySortKey = 'name' | 'categoryId' | 'quantity' | 'status';
export type SortDirection = 'asc' | 'desc';

/**
 * Pure, non-mutating sort of inventory rows by any column. `quantity` sorts
 * numerically (so 12 follows 5, not the lexicographic reverse); the string
 * columns (name/categoryId/status) sort via `localeCompare`. Returns a new
 * array — the caller keeps the domain-provided order untouched.
 */
export function sortInventoryRows(
  rows: ProductStockRow[],
  key: InventorySortKey,
  direction: SortDirection,
): ProductStockRow[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp =
      key === 'quantity'
        ? a.quantity - b.quantity
        : String(a[key]).localeCompare(String(b[key]));
    return factor * cmp;
  });
}

export interface InventoryRowFilter {
  text?: string; // free-text match against product name (case-insensitive, trimmed)
  categoryId?: string; // exact categoryId; empty/undefined means "all categories"
}

/**
 * Pure, non-mutating row filter: keeps rows whose name contains `text`
 * (case-insensitive) AND whose categoryId equals `categoryId`. An empty/blank
 * `text` or empty `categoryId` disables that criterion. Both empty → all rows.
 */
export function filterInventoryRows(
  rows: ProductStockRow[],
  filter: InventoryRowFilter,
): ProductStockRow[] {
  const text = filter.text?.trim().toLowerCase() ?? '';
  const categoryId = filter.categoryId ?? '';
  return rows.filter((row) => {
    const matchesText = text === '' || row.name.toLowerCase().includes(text);
    const matchesCategory = categoryId === '' || row.categoryId === categoryId;
    return matchesText && matchesCategory;
  });
}

/**
 * Sorted, de-duplicated list of the categoryIds present in `rows` — the option
 * set for a per-warehouse category filter.
 */
export function inventoryCategories(rows: ProductStockRow[]): string[] {
  return [...new Set(rows.map((row) => row.categoryId))].sort((a, b) => a.localeCompare(b));
}

export interface InventorySummary {
  warehouses: WarehouseInventory[]; // preserves state.warehouses order
  totalUnits: number;
  totalRetailValueUSD: number;
  totalCostValueUSD: number;
}

/**
 * Pure aggregation: builds a fully-computed inventory view model from
 * `SeedState`, one `WarehouseInventory` per warehouse (in `state.warehouses`
 * order) plus grand totals. No I/O, no formatting/locale — that happens only
 * at the leaf render (see `formatMoney` usage in the presentational layer).
 * Inventory entries whose `productId` has no matching product are skipped
 * (excluded from rows AND totals) without throwing — defends against
 * corrupted/partial seed data.
 */
export function buildInventorySummary(state: SeedState): InventorySummary {
  const productById = new Map(state.products.map((product) => [product.id, product]));

  const warehouses: WarehouseInventory[] = state.warehouses.map((warehouse) => {
    let totalUnits = 0;
    let retailValueUSD = 0;
    let costValueUSD = 0;
    const rows: ProductStockRow[] = [];

    for (const entry of state.inventory) {
      if (entry.warehouseId !== warehouse.id) continue;

      const product = productById.get(entry.productId);
      if (!product) continue; // orphan skip — no matching product

      const { quantity } = entry;
      totalUnits += quantity;
      retailValueUSD += product.price * quantity;
      costValueUSD += product.costUSD * quantity;

      rows.push({
        productId: entry.productId,
        name: product.name,
        categoryId: product.categoryId,
        quantity,
        status: quantity > 0 ? 'disponible' : 'agotado',
      });
    }

    rows.sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.name.localeCompare(b.name));

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      totalUnits,
      retailValueUSD,
      costValueUSD,
      rows,
    };
  });

  const totalUnits = warehouses.reduce((sum, w) => sum + w.totalUnits, 0);
  const totalRetailValueUSD = warehouses.reduce((sum, w) => sum + w.retailValueUSD, 0);
  const totalCostValueUSD = warehouses.reduce((sum, w) => sum + w.costValueUSD, 0);

  return { warehouses, totalUnits, totalRetailValueUSD, totalCostValueUSD };
}
