import type { StockLevel } from './stock-level.js';

/** Optional filter for `IStockLevelRepository.list`. */
export interface StockLevelListFilter {
  readonly productId?: string;
  readonly warehouseId?: string;
}

/**
 * Input to `IStockLevelRepository.reserve`/`.release`. `quantity` is a
 * positive magnitude — direction is encoded by which method is called, never
 * by sign.
 */
export interface ReserveStockInput {
  readonly productId: string;
  readonly warehouseId: string;
  readonly quantity: number;
}

/**
 * Port for `StockLevel` — reads + reservation writes. Physical `onHand`
 * mutations still happen ONLY via the transactional flow behind
 * `IStockMovementRepository.record`; this port never exposes a direct
 * create/update for `onHand`. `reserve`/`release` are the ONLY writes this
 * port exposes, and they touch `reserved` exclusively (never `onHand`,
 * never a `StockMovement` row — see `stock-reservation-seam.md`). A missing
 * `(productId, warehouseId)` pair means zero stock
 * (`findByProductAndWarehouse` resolves to `null`; callers treat that as
 * `onHand=0, reserved=0, available=0`), never a thrown error — StockLevel
 * rows are lazily created on first movement, not seeded.
 */
export interface IStockLevelRepository {
  findById(id: string): Promise<StockLevel | null>;
  findByProductAndWarehouse(productId: string, warehouseId: string): Promise<StockLevel | null>;
  list(filter?: StockLevelListFilter): Promise<StockLevel[]>;
  /** Raises `reserved` by `quantity`. Throws `InsufficientStockError` when `onHand - (reserved + quantity) < 0`. */
  reserve(input: ReserveStockInput): Promise<StockLevel>;
  /** Lowers `reserved` by `quantity`. Throws `InvalidStockLevelError` when `reserved - quantity < 0`. */
  release(input: ReserveStockInput): Promise<StockLevel>;
}

/** DI token for `IStockLevelRepository` — consumers inject by this symbol. */
export const STOCK_LEVEL_REPOSITORY = Symbol('IStockLevelRepository');
