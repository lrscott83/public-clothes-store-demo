import { randomUUID } from 'node:crypto';
import { InvalidStockLevelError, NegativeStockError } from './errors.js';
import { movementDirection, type StockMovementType } from './stock-movement.js';

/**
 * StockLevel — the (product x warehouse) stock row. `available` is
 * intentionally NOT a field here — it is DERIVED at read time by the pure
 * `availableStock` function, never stored (avoids a contradictory-state
 * trap between a stored `onHand`/`reserved` and a stored `available`,
 * mirroring `Product.finalPrice`). Unique per `(productId, warehouseId)`.
 */
export interface StockLevel {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createStockLevel`. `id`/`createdAt`/`updatedAt` are optional so
 * the factory can mint a brand-new (lazily-created) level. Also the shape
 * `IStockLevelRepository` implementations map rows into.
 */
export interface CreateStockLevelInput {
  readonly id?: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly onHand?: number;
  readonly reserved?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `StockLevel`. Enforces `onHand >= 0`,
 * `reserved >= 0`, both integers. Throws `InvalidStockLevelError` — never
 * silently clamps a negative/fractional value.
 */
export function createStockLevel(input: CreateStockLevelInput): StockLevel {
  const onHand = input.onHand ?? 0;
  const reserved = input.reserved ?? 0;

  if (!Number.isInteger(onHand) || onHand < 0) {
    throw new InvalidStockLevelError(`StockLevel onHand must be a non-negative integer (got ${onHand})`);
  }
  if (!Number.isInteger(reserved) || reserved < 0) {
    throw new InvalidStockLevelError(
      `StockLevel reserved must be a non-negative integer (got ${reserved})`,
    );
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    productId: input.productId,
    warehouseId: input.warehouseId,
    onHand,
    reserved,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/**
 * Pure derivation: `available = onHand - reserved`. NEVER stored — always
 * computed at read time (locked model decision, see design.md decision #1).
 */
export function availableStock(level: StockLevel): number {
  return level.onHand - level.reserved;
}

/**
 * Pure: computes the resulting `StockLevel` after applying a movement's
 * signed direction to `onHand`. Throws `NegativeStockError` if the result
 * would go below `0`. Reused inside the transactional
 * `PrismaStockMovementRepository.record` for the common (uncontended) path
 * — the DB-level guarded `UPDATE` + `CHECK` constraint are the race-free
 * backstop for concurrent movements.
 */
export function applyMovement(
  level: StockLevel,
  type: StockMovementType,
  quantity: number,
): StockLevel {
  const nextOnHand = level.onHand + movementDirection(type) * quantity;
  if (nextOnHand < 0) {
    throw new NegativeStockError(
      `Movement ${type} of ${quantity} would drive onHand negative (have ${level.onHand})`,
    );
  }
  return { ...level, onHand: nextOnHand, updatedAt: new Date() };
}
