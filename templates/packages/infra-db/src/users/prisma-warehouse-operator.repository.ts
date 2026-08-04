import { Injectable } from '@nestjs/common';
import type {
  CreateWarehouseOperatorInput,
  IWarehouseOperatorRepository,
  WarehouseOperator as DomainWarehouseOperator,
} from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/** Shape shared by every row Prisma returns for the `WarehouseOperator` model (table `warehouse_operator`). */
interface WarehouseOperatorRow {
  readonly companyUserId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: WarehouseOperatorRow): DomainWarehouseOperator {
  return {
    companyUserId: row.companyUserId,
    warehouseId: row.warehouseId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IWarehouseOperatorRepository`. `companyUserId` is the
 * PK/FK (1:1 with the tenant `CompanyUser`, design.md D1); `findByWarehouseId`
 * supports listing every operator scoped to a given warehouse —
 * `warehouseId` is deliberately NOT unique, a single `Warehouse` MAY have
 * many operators. `findByUserId(userId)` queries the `companyUserId` column
 * — the port's doc comment explains why the parameter name stayed `userId`.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaWarehouseOperatorRepository implements IWarehouseOperatorRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(input: CreateWarehouseOperatorInput): Promise<DomainWarehouseOperator> {
    const row = await this.tenantContext.getClient().warehouseOperator.create({
      data: {
        companyUserId: input.companyUserId,
        warehouseId: input.warehouseId,
      },
    });
    return toDomain(row);
  }

  async findByUserId(userId: string): Promise<DomainWarehouseOperator | null> {
    const row = await this.tenantContext
      .getClient()
      .warehouseOperator.findUnique({ where: { companyUserId: userId } });
    return row ? toDomain(row) : null;
  }

  async findByWarehouseId(warehouseId: string): Promise<DomainWarehouseOperator[]> {
    const rows = await this.tenantContext.getClient().warehouseOperator.findMany({ where: { warehouseId } });
    return rows.map(toDomain);
  }
}
