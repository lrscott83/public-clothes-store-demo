import { randomUUID } from 'node:crypto';
import { InvalidWarehouseError } from './errors.js';

/**
 * Warehouse master-data entity. FLAT (no address/location hierarchy field) —
 * an MVP-scoped set of named physical locations, not a nested geography
 * model. `StockLevel.warehouseId`/`StockMovement.warehouseId` are required
 * FKs to this entity's `id`.
 */
export interface Warehouse {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createWarehouse`. `id`/`createdAt`/`updatedAt` are optional so
 * the factory can mint a brand-new warehouse (defaults applied). Also the
 * shape `IWarehouseRepository.create` accepts.
 */
export interface CreateWarehouseInput {
  readonly id?: string;
  readonly name: string;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `Warehouse`. Enforces a non-empty,
 * non-whitespace `name`. Throws `InvalidWarehouseError` — never silently
 * accepts a blank name.
 */
export function createWarehouse(input: CreateWarehouseInput): Warehouse {
  if (!input.name || input.name.trim().length === 0) {
    throw new InvalidWarehouseError('Warehouse name must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
