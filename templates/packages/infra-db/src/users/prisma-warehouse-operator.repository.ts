import { Injectable } from '@nestjs/common';
import type {
  CreateWarehouseOperatorInput,
  IWarehouseOperatorRepository,
  WarehouseOperator as DomainWarehouseOperator,
} from '@store-mgmt/domain';
import { TenantDefaultPrismaService } from '../tenant/tenant-default-prisma.service.js';

/** Shape shared by every row Prisma returns for the `WarehouseOperator` model (table `warehouse_operator`). */
interface WarehouseOperatorRow {
  readonly userId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: WarehouseOperatorRow): DomainWarehouseOperator {
  return {
    userId: row.userId,
    warehouseId: row.warehouseId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IWarehouseOperatorRepository`. `userId` is the PK/FK
 * (1:1 with `User`); `findByWarehouseId` supports listing every operator
 * scoped to a given warehouse — `warehouseId` is deliberately NOT unique, a
 * single `Warehouse` MAY have many operators.
 */
@Injectable()
export class PrismaWarehouseOperatorRepository implements IWarehouseOperatorRepository {
  constructor(private readonly prisma: TenantDefaultPrismaService) {}

  async create(input: CreateWarehouseOperatorInput): Promise<DomainWarehouseOperator> {
    const row = await this.prisma.warehouseOperator.create({
      data: {
        userId: input.userId,
        warehouseId: input.warehouseId,
      },
    });
    return toDomain(row);
  }

  async findByUserId(userId: string): Promise<DomainWarehouseOperator | null> {
    const row = await this.prisma.warehouseOperator.findUnique({ where: { userId } });
    return row ? toDomain(row) : null;
  }

  async findByWarehouseId(warehouseId: string): Promise<DomainWarehouseOperator[]> {
    const rows = await this.prisma.warehouseOperator.findMany({ where: { warehouseId } });
    return rows.map(toDomain);
  }
}
