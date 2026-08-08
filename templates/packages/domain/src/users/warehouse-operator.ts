/**
 * WarehouseOperator — per-warehouse scope detail for a user holding the
 * `warehouse_operator` role. `companyUserId` is both PK and FK (1:1 with the
 * tenant `CompanyUser`). `warehouseId` is deliberately NOT unique — a single
 * `Warehouse` MAY have many operators.
 *
 * RESHAPED by `multi-tenant-by-schema` (design.md D1, spec salesops-inventory
 * "WarehouseOperator FKs Tenant CompanyUser, Not Master User"): the link used
 * to be `userId @id → User` (master schema). Prisma forbids a cross-schema
 * `@relation`, so it becomes `companyUserId @id → CompanyUser` (tenant-side).
 * Since `CompanyUser.id` IS the master `User.id` (D1's collapsed PK), the
 * value a caller passes is unchanged — only the field name and its FK target
 * moved.
 */
export interface WarehouseOperator {
  readonly companyUserId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Input to `createWarehouseOperator`. `createdAt`/`updatedAt` optional so the factory can mint a brand-new row. */
export interface CreateWarehouseOperatorInput {
  readonly companyUserId: string;
  readonly warehouseId: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/** Constructs a `WarehouseOperator` detail row — no invariants beyond required fields (both ids are opaque foreign keys). */
export function createWarehouseOperator(input: CreateWarehouseOperatorInput): WarehouseOperator {
  const now = new Date();
  return {
    companyUserId: input.companyUserId,
    warehouseId: input.warehouseId,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
