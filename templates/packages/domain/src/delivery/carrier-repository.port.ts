import type { Carrier, CreateCarrierInput } from './carrier.js';

/** Optional filter for `ICarrierRepository.list`. */
export interface CarrierListFilter {
  /**
   * When `true`, `active: false` carriers are excluded. When omitted or
   * `false`, ALL carriers are returned, soft-deleted ones included.
   *
   * NOTE the inverted sense relative to `IWarehouseRepository`'s
   * `includeInactive`, whose default EXCLUDES inactive rows. Both are
   * tested contracts; they simply opt in from opposite ends.
   *
   * Both LIST-shaped HTTP reads pass `activeOnly: true` explicitly —
   * `DeliveryService.listCarriers` and `getCarrierCapacity` — so a
   * soft-deleted carrier never appears in a list or a capacity snapshot.
   *
   * `findById` does NOT filter, and `GET /delivery/carriers/:id` therefore
   * still returns a soft-deleted carrier. That is deliberate and matches
   * `GET /warehouses/:id`'s own behavior: a caller addressing a row BY ID
   * already knows it exists, and hiding it would leave an admin unable to
   * look at what they just deactivated. (This comment used to claim "no
   * endpoint ever exposes a soft-deleted carrier", which was false for that
   * one endpoint.)
   */
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
  /**
   * Throws `CarrierNotFoundError` for an unknown id.
   *
   * `active` is the SAME column `softDelete` writes, so a patch carrying
   * `active: false` is a deactivation and is held to the SAME invariant:
   * `CarrierHasOpenAssignmentsError` while `in_transit` assignments remain.
   * Two writers of one column with different preconditions is not a narrower
   * grant, it is a one-line bypass of the guard.
   */
  update(id: string, patch: CarrierUpdateInput): Promise<Carrier>;
  /**
   * Throws `CarrierNotFoundError` for an unknown id and
   * `CarrierHasOpenAssignmentsError` while the carrier still holds
   * `in_transit` assignments. Both checks happen inside ONE transaction
   * holding a row lock on the carrier, so a concurrent `assign` cannot land
   * between the check and the write (`create` takes the same lock).
   */
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Carrier | null>;
  list(filter?: CarrierListFilter): Promise<Carrier[]>;
}

/** DI token for `ICarrierRepository` — consumers inject by this symbol. */
export const CARRIER_REPOSITORY = Symbol('ICarrierRepository');
