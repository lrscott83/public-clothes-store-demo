import { Injectable } from '@nestjs/common';
import type {
  CreateWarehouseInput,
  IWarehouseRepository,
  Warehouse as DomainWarehouse,
  WarehouseListFilter,
  WarehouseUpdateInput,
} from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/** Shape shared by every row Prisma returns for the `Warehouse` model. */
interface WarehouseRow {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: WarehouseRow): DomainWarehouse {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IWarehouseRepository`. `create()` never passes `id`
 * through to Prisma — the DB always generates it (`@default(uuid())`).
 * `softDelete` flips `active`, never a hard DELETE (StockLevel/StockMovement
 * FK references would orphan history).
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaWarehouseRepository implements IWarehouseRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(input: CreateWarehouseInput): Promise<DomainWarehouse> {
    const row = await this.tenantContext.getClient().warehouse.create({
      data: {
        name: input.name,
        active: input.active ?? true,
      },
    });
    return toDomain(row);
  }

  async update(id: string, patch: WarehouseUpdateInput): Promise<DomainWarehouse> {
    const row = await this.tenantContext.getClient().warehouse.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.tenantContext.getClient().warehouse.update({ where: { id }, data: { active: false } });
  }

  async findById(id: string): Promise<DomainWarehouse | null> {
    const row = await this.tenantContext.getClient().warehouse.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: WarehouseListFilter): Promise<DomainWarehouse[]> {
    const rows = await this.tenantContext.getClient().warehouse.findMany({
      where: filter?.includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(toDomain);
  }
}
