import { randomUUID } from 'node:crypto';

/**
 * Coverage join row — `Carrier` x `Warehouse`, supporting 0, 1, or N
 * warehouses per carrier uniformly (design §7). Deliberately flat: no `zone`
 * or geography dimension (D2). `@@unique([carrierId, warehouseId])` is
 * enforced at the infra layer (Phase 3).
 */
export interface CarrierWarehouse {
  readonly id: string;
  readonly carrierId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
}

/** Input to `createCarrierWarehouse`. `id`/`createdAt` are optional so the factory can mint a fresh row. */
export interface CreateCarrierWarehouseInput {
  readonly id?: string;
  readonly carrierId: string;
  readonly warehouseId: string;
  readonly createdAt?: Date;
}

/**
 * Constructs a `CarrierWarehouse`. Pairs `carrierId`+`warehouseId` — no
 * runtime validation beyond the TYPE (mirrors `createCarrier`; the spec
 * defines no rejection scenario here either).
 */
export function createCarrierWarehouse(input: CreateCarrierWarehouseInput): CarrierWarehouse {
  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    carrierId: input.carrierId,
    warehouseId: input.warehouseId,
    createdAt: input.createdAt ?? now,
  };
}
