import type { InventoryEntry, Warehouse } from './types';

export interface CartLine {
  productId: string;
  quantity: number;
}

/**
 * Returns the subset of `warehouses` that fully cover the cart: for every
 * cart line, the warehouse's inventory entry for that product must exist
 * and have `quantity >= line.quantity`. A warehouse missing coverage for
 * any single line is excluded.
 */
export function eligibleWarehouses(
  cart: CartLine[],
  inventory: InventoryEntry[],
  warehouses: Warehouse[],
): Warehouse[] {
  return warehouses.filter((warehouse) =>
    cart.every((line) => {
      const entry = inventory.find(
        (item) => item.warehouseId === warehouse.id && item.productId === line.productId,
      );
      return entry !== undefined && entry.quantity >= line.quantity;
    }),
  );
}
