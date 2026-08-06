import type { Carrier, CreateCarrierInput } from './carrier.js';

/** Optional filter for `ICarrierRepository.list`. */
export interface CarrierListFilter {
  /** When omitted or `false`, `active: false` carriers are excluded (default listing). */
  readonly activeOnly?: boolean;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type CarrierUpdateInput = Partial<Omit<Carrier, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing carriers. Zero dependency on any persistence
 * technology. `softDelete` flips `active`, never a hard `DELETE` — mirrors
 * `IWarehouseRepository.softDelete` exactly.
 */
export interface ICarrierRepository {
  create(input: CreateCarrierInput): Promise<Carrier>;
  update(id: string, patch: CarrierUpdateInput): Promise<Carrier>;
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Carrier | null>;
  list(filter?: CarrierListFilter): Promise<Carrier[]>;
}

/** DI token for `ICarrierRepository` — consumers inject by this symbol. */
export const CARRIER_REPOSITORY = Symbol('ICarrierRepository');
