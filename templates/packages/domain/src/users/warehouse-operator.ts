/**
 * WarehouseOperator — per-warehouse scope detail for a user holding the
 * `warehouse_operator` role. `userId` is both PK and FK (1:1 with `User`).
 * `warehouseId` is deliberately NOT unique — a single `Warehouse` MAY have
 * many operators.
 */
export interface WarehouseOperator {
  readonly userId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Input to `createWarehouseOperator`. `createdAt`/`updatedAt` optional so the factory can mint a brand-new row. */
export interface CreateWarehouseOperatorInput {
  readonly userId: string;
  readonly warehouseId: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/** Constructs a `WarehouseOperator` detail row — no invariants beyond required fields (both ids are opaque foreign keys). */
export function createWarehouseOperator(input: CreateWarehouseOperatorInput): WarehouseOperator {
  const now = new Date();
  return {
    userId: input.userId,
    warehouseId: input.warehouseId,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
