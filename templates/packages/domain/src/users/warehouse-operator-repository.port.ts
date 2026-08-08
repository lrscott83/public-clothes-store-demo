import type { CreateWarehouseOperatorInput, WarehouseOperator } from './warehouse-operator.js';

/**
 * Port for reading/writing `WarehouseOperator` detail rows. `companyUserId`
 * is the PK/FK (1:1 with the tenant `CompanyUser`, design.md D1);
 * `findByWarehouseId` supports listing every operator scoped to a given
 * warehouse (a `Warehouse` MAY have many). `findByUserId` keeps its name and
 * signature (takes the master `User.id`) even after the D1 reshape — every
 * caller resolves it from `req.user.id`, and `CompanyUser.id` IS that same
 * `User.id` (D1's collapsed PK), so the value passed is unchanged; only the
 * column it matches against, internally, moved from `user_id` to
 * `company_user_id`.
 */
export interface IWarehouseOperatorRepository {
  create(input: CreateWarehouseOperatorInput): Promise<WarehouseOperator>;
  findByUserId(userId: string): Promise<WarehouseOperator | null>;
  findByWarehouseId(warehouseId: string): Promise<WarehouseOperator[]>;
}

/** DI token for `IWarehouseOperatorRepository` — consumers inject by this symbol. */
export const WAREHOUSE_OPERATOR_REPOSITORY = Symbol('IWarehouseOperatorRepository');
