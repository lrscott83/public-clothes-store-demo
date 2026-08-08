import type { StockLevel } from './stock-level.js';
import type { CreateStockMovementInput, StockMovement } from './stock-movement.js';

/** Optional filter for `IStockMovementRepository.list`. */
export interface StockMovementListFilter {
  readonly productId?: string;
  readonly warehouseId?: string;
}

/** Result of a successful `IStockMovementRepository.record` call. */
export interface RecordMovementResult {
  readonly movement: StockMovement;
  readonly stockLevel: StockLevel;
}

/**
 * Port for the append-only `StockMovement` log. `record` is THE onHand
 * mutation entrypoint — it lazily gets-or-creates the `StockLevel` row,
 * adjusts `onHand` by the movement's signed direction, and appends the
 * `StockMovement`, all atomically (implemented via `prisma.$transaction` in
 * infra-db; the api layer only holds this port, it never opens a
 * transaction itself). Throws `NegativeStockError` if the movement would
 * drive `onHand` below `0`.
 */
export interface IStockMovementRepository {
  record(input: CreateStockMovementInput): Promise<RecordMovementResult>;
  list(filter?: StockMovementListFilter): Promise<StockMovement[]>;
}

/** DI token for `IStockMovementRepository` — consumers inject by this symbol. */
export const STOCK_MOVEMENT_REPOSITORY = Symbol('IStockMovementRepository');
