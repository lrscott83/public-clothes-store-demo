import { Injectable } from '@nestjs/common';
import type {
  CarrierWarehouse as DomainCarrierWarehouse,
  CreateCarrierWarehouseInput,
  ICarrierWarehouseRepository,
} from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/** Shape of every row Prisma returns for the `CarrierWarehouse` model. */
interface CarrierWarehouseRow {
  readonly id: string;
  readonly carrierId: string;
  readonly warehouseId: string;
  readonly createdAt: Date;
}

function toDomain(row: CarrierWarehouseRow): DomainCarrierWarehouse {
  return {
    id: row.id,
    carrierId: row.carrierId,
    warehouseId: row.warehouseId,
    createdAt: row.createdAt,
  };
}

/**
 * Prisma adapter for `ICarrierWarehouseRepository`. `add` lets
 * `@@unique([carrierId, warehouseId])` do the enforcement — a duplicate pair
 * throws P2002 straight through, uncaught (spec: "enforced"). `remove` is a
 * `deleteMany`, which is naturally a no-op (0 rows affected, no error) when
 * the pair does not exist.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this`.
 */
@Injectable()
export class PrismaCarrierWarehouseRepository implements ICarrierWarehouseRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async add(input: CreateCarrierWarehouseInput): Promise<DomainCarrierWarehouse> {
    const row = await this.tenantContext.getClient().carrierWarehouse.create({
      data: {
        carrierId: input.carrierId,
        warehouseId: input.warehouseId,
      },
    });
    return toDomain(row);
  }

  async remove(carrierId: string, warehouseId: string): Promise<void> {
    await this.tenantContext.getClient().carrierWarehouse.deleteMany({
      where: { carrierId, warehouseId },
    });
  }

  async listByCarrier(carrierId: string): Promise<DomainCarrierWarehouse[]> {
    const rows = await this.tenantContext.getClient().carrierWarehouse.findMany({
      where: { carrierId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }
}
