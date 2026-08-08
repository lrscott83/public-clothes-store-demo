import { randomUUID } from 'node:crypto';
import { InvalidStockMovementError } from './errors.js';

/**
 * Closed set of physical/logical `onHand` movement types. `quantity` is
 * ALWAYS a positive magnitude — direction comes from `type`, never from a
 * signed delta (see `movementDirection`).
 */
export type StockMovementType =
  | 'purchase_in'
  | 'sale_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment_in'
  | 'adjustment_out';

/** `_in` types add to `onHand`; `_out` types subtract. Pure, no I/O. */
export function movementDirection(type: StockMovementType): 1 | -1 {
  return type.endsWith('_out') ? -1 : 1;
}

/**
 * StockMovement — append-only audit log entry of a physical `onHand`
 * change. `reason` defaults to `null` (optional free text); `createdBy`
 * defaults to `null` — no auth module yet (see the transversal
 * `@CurrentUser` seam, not built here).
 */
export interface StockMovement {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: StockMovementType;
  readonly reason: string | null;
  readonly quantity: number;
  readonly createdAt: Date;
  readonly createdBy?: string | null;
}

/**
 * Input to `createStockMovement`. `id`/`createdAt` are optional so the
 * factory can mint a brand-new movement (defaults applied). Also the shape
 * `IStockMovementRepository.record` accepts.
 */
export interface CreateStockMovementInput {
  readonly id?: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: StockMovementType;
  readonly reason?: string | null;
  readonly quantity: number;
  readonly createdAt?: Date;
  readonly createdBy?: string | null;
}

/**
 * Validates and constructs a `StockMovement`. Enforces `quantity > 0` and
 * integer. Throws `InvalidStockMovementError` — never silently accepts a
 * zero/negative/fractional quantity.
 */
export function createStockMovement(input: CreateStockMovementInput): StockMovement {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InvalidStockMovementError(
      `StockMovement quantity must be a positive integer (got ${input.quantity})`,
    );
  }

  return {
    id: input.id ?? randomUUID(),
    productId: input.productId,
    warehouseId: input.warehouseId,
    type: input.type,
    reason: input.reason ?? null,
    quantity: input.quantity,
    createdAt: input.createdAt ?? new Date(),
    createdBy: input.createdBy ?? null,
  };
}
