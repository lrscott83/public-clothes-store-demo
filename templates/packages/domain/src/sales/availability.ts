import type { StockLevel } from '../inventory/stock-level.js';
import { WarehouseCannotFulfillOrderError } from './errors.js';

/**
 * Whole-basket availability for order creation. Pure — takes a `StockLevel[]`
 * SNAPSHOT, never a repository, exactly as `createOrder` takes an
 * `ExchangeRate[]` snapshot rather than the Currency port.
 *
 * This lives in `sales/`, NOT `inventory/`, and that placement is forced:
 * `openspec/specs/salesops-inventory/spec.md` states that availability-FOR-SALE
 * is Ventas' responsibility and MUST NOT live in Inventory. Inventory owns the
 * stock numbers; Sales owns what "can I sell this" means.
 *
 * Coverage is measured against AVAILABLE stock (`onHand - reserved`), never
 * `onHand`. `reserved` is exactly the quantity already committed to verified
 * orders, so counting it as sellable would admit a basket that `confirmOrder`
 * must then reject — producing the `InsufficientStockError` this check exists
 * to prevent.
 *
 * This is a FAST-FAIL, not a hold. Nothing is reserved here; `confirmOrder`
 * still reserves and still rejects on insufficient stock. The read-then-create
 * race is accepted deliberately — see the pinned scenario in
 * `specs/salesops-ventas/spec.md`.
 */
export interface BasketLine {
  readonly productId: string;
  readonly quantity: number;
}

/** Available = on hand minus what is already committed to verified orders. */
function availableIn(levels: readonly StockLevel[], warehouseId: string, productId: string): number {
  const row = levels.find((l) => l.warehouseId === warehouseId && l.productId === productId);
  // A missing row means no stock — never unlimited.
  return row ? row.onHand - row.reserved : 0;
}

/** Collapses repeated product ids so two lines of the same product are checked as their sum. */
function totalsByProduct(basket: readonly BasketLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of basket) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }

  return totals;
}

/**
 * True when `warehouseId` can cover EVERY line of `basket` on its own.
 * Whole-basket, single-warehouse: partial coverage across several warehouses
 * is not a thing an order can express, so it is not a thing this reports.
 */
export function warehouseCoversBasket(
  warehouseId: string,
  basket: readonly BasketLine[],
  levels: readonly StockLevel[],
): boolean {
  for (const [productId, quantity] of totalsByProduct(basket)) {
    if (availableIn(levels, warehouseId, productId) < quantity) {
      return false;
    }
  }

  return true;
}

/**
 * The subset of `warehouseIds` that fully covers `basket`, in the order given.
 * Never narrows the candidate set on the caller's behalf — the sales agent is
 * bound to no warehouse (D2), and scoping is the caller's concern, not this
 * function's.
 */
export function eligibleWarehouses(
  basket: readonly BasketLine[],
  warehouseIds: readonly string[],
  levels: readonly StockLevel[],
): string[] {
  return warehouseIds.filter((id) => warehouseCoversBasket(id, basket, levels));
}

/** Guard form: throws instead of returning `false`. Used at order creation and on warehouse change. */
export function assertWarehouseCoversBasket(
  warehouseId: string,
  basket: readonly BasketLine[],
  levels: readonly StockLevel[],
): void {
  if (!warehouseCoversBasket(warehouseId, basket, levels)) {
    throw new WarehouseCannotFulfillOrderError(warehouseId);
  }
}
