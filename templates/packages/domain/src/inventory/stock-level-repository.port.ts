import type { StockLevel } from './stock-level.js';

/** Optional filter for `IStockLevelRepository.list`. */
export interface StockLevelListFilter {
  readonly productId?: string;
  readonly warehouseId?: string;
}

/**
 * Read-only port for `StockLevel`. Writes happen ONLY via the transactional
 * onHand-mutation flow behind `IStockMovementRepository.record` — this port
 * never exposes a direct create/update. A missing `(productId, warehouseId)`
 * pair means zero stock (`findByProductAndWarehouse` resolves to `null`;
 * callers treat that as `onHand=0, reserved=0, available=0`), never a thrown
 * error — StockLevel rows are lazily created on first movement, not seeded.
 */
export interface IStockLevelRepository {
  findById(id: string): Promise<StockLevel | null>;
  findByProductAndWarehouse(productId: string, warehouseId: string): Promise<StockLevel | null>;
  list(filter?: StockLevelListFilter): Promise<StockLevel[]>;
}

/** DI token for `IStockLevelRepository` — consumers inject by this symbol. */
export const STOCK_LEVEL_REPOSITORY = Symbol('IStockLevelRepository');
