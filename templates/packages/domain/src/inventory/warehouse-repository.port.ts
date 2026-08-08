import type { CreateWarehouseInput, Warehouse } from './warehouse.js';

/** Optional filter for `IWarehouseRepository.list`. */
export interface WarehouseListFilter {
  /** When omitted or `false`, `active: false` warehouses are excluded (default listing). */
  readonly includeInactive?: boolean;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type WarehouseUpdateInput = Partial<Omit<Warehouse, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing warehouses. Zero dependency on any persistence
 * technology — domain and application code import this interface, never a
 * concrete Prisma class. `softDelete` flips `active`, never a hard DELETE
 * (StockLevel/StockMovement FKs would orphan history, exactly like
 * `Product.softDelete`).
 */
export interface IWarehouseRepository {
  create(input: CreateWarehouseInput): Promise<Warehouse>;
  update(id: string, patch: WarehouseUpdateInput): Promise<Warehouse>;
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Warehouse | null>;
  list(filter?: WarehouseListFilter): Promise<Warehouse[]>;
}

/** DI token for `IWarehouseRepository` — consumers inject by this symbol. */
export const WAREHOUSE_REPOSITORY = Symbol('IWarehouseRepository');
