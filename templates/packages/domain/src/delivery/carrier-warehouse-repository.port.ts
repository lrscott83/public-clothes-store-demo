import type { CarrierWarehouse, CreateCarrierWarehouseInput } from './carrier-warehouse.js';

/**
 * Port for reading/writing carrier-warehouse coverage. SEPARATE from
 * `ICarrierRepository` on purpose (design §7): coverage is written
 * independently of the catalog (`PATCH /carriers/:id/warehouses`), and a
 * merged port would force every carrier read to know about warehouses.
 */
export interface ICarrierWarehouseRepository {
  add(input: CreateCarrierWarehouseInput): Promise<CarrierWarehouse>;
  /** No-op if the pair does not exist — removing coverage that was never declared is not an error. */
  remove(carrierId: string, warehouseId: string): Promise<void>;
  listByCarrier(carrierId: string): Promise<CarrierWarehouse[]>;
}

/** DI token for `ICarrierWarehouseRepository` — consumers inject by this symbol. */
export const CARRIER_WAREHOUSE_REPOSITORY = Symbol('ICarrierWarehouseRepository');
