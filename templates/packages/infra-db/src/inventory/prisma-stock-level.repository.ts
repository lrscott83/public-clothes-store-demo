import { Injectable } from '@nestjs/common';
import type {
  IStockLevelRepository,
  StockLevel as DomainStockLevel,
  StockLevelListFilter,
} from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';

/** Shape shared by every row Prisma returns for the `StockLevel` model. */
interface StockLevelRow {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: StockLevelRow): DomainStockLevel {
  return {
    id: row.id,
    productId: row.productId,
    warehouseId: row.warehouseId,
    onHand: row.onHand,
    reserved: row.reserved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IStockLevelRepository` — READ-ONLY. Writes to
 * `StockLevel` happen exclusively through the transactional
 * `PrismaStockMovementRepository.record` flow; this repository never
 * creates or updates a row. A missing `(productId, warehouseId)` pair
 * resolves to `null` — the caller treats that as zero stock, never an
 * error (StockLevel rows are lazily created on first movement).
 */
@Injectable()
export class PrismaStockLevelRepository implements IStockLevelRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DomainStockLevel | null> {
    const row = await this.prisma.stockLevel.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByProductAndWarehouse(
    productId: string,
    warehouseId: string,
  ): Promise<DomainStockLevel | null> {
    const row = await this.prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    return row ? toDomain(row) : null;
  }

  async list(filter?: StockLevelListFilter): Promise<DomainStockLevel[]> {
    const rows = await this.prisma.stockLevel.findMany({
      where: {
        ...(filter?.productId ? { productId: filter.productId } : {}),
        ...(filter?.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
    });
    return rows.map(toDomain);
  }
}
