import type { CreateWarehouseOperatorInput, WarehouseOperator } from './warehouse-operator.js';

/**
 * Port for reading/writing `WarehouseOperator` detail rows. `userId` is the
 * PK/FK (1:1 with `User`); `findByWarehouseId` supports listing every
 * operator scoped to a given warehouse (a `Warehouse` MAY have many).
 */
export interface IWarehouseOperatorRepository {
  create(input: CreateWarehouseOperatorInput): Promise<WarehouseOperator>;
  findByUserId(userId: string): Promise<WarehouseOperator | null>;
  findByWarehouseId(warehouseId: string): Promise<WarehouseOperator[]>;
}

/** DI token for `IWarehouseOperatorRepository` — consumers inject by this symbol. */
export const WAREHOUSE_OPERATOR_REPOSITORY = Symbol('IWarehouseOperatorRepository');
