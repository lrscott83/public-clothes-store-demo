import { Injectable } from '@nestjs/common';
import type {
  CreateStockMovementInput,
  IStockMovementRepository,
  RecordMovementResult,
  StockMovement as DomainStockMovement,
  StockMovementListFilter,
  StockMovementType,
} from '@store-mgmt/domain';
import { TenantDefaultPrismaService } from '../tenant/tenant-default-prisma.service.js';
import { applyStockMovementTx } from './apply-stock-movement.js';

/** Shape shared by every row Prisma returns for the `StockMovement` model. */
interface StockMovementRow {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: string;
  readonly quantity: number;
  readonly reason: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
}

function movementToDomain(row: StockMovementRow): DomainStockMovement {
  return {
    id: row.id,
    productId: row.productId,
    warehouseId: row.warehouseId,
    // Prisma's StockMovementType enum values are lowercase, identical to the
    // TS union — identity mapping, no translation table needed (see
    // design.md decision #6; parity asserted by the repository spec).
    type: row.type as StockMovementType,
    reason: row.reason,
    quantity: row.quantity,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/**
 * Prisma adapter for `IStockMovementRepository`. `record()` is THE onHand
 * mutation entrypoint (design.md's central decision — there is no other
 * write path to `StockLevel.onHand`), implemented as ONE
 * `prisma.$transaction` wrapping the shared `applyStockMovementTx` helper
 * (extracted in backend-ventas Phase 4 so `PrismaOrderRepository.deliver`
 * can reuse the SAME guarded `onHand` UPDATE for `sale_out` inside the
 * order's own transaction — mirrors `PrismaStockLevelRepository.reserve`/
 * `.release` wrapping `applyReservationTx`). Behavior is unchanged from the
 * pre-extraction inline implementation.
 */
@Injectable()
export class PrismaStockMovementRepository implements IStockMovementRepository {
  constructor(private readonly prisma: TenantDefaultPrismaService) {}

  async record(input: CreateStockMovementInput): Promise<RecordMovementResult> {
    return this.prisma.$transaction((tx) => applyStockMovementTx(tx, input));
  }

  async list(filter?: StockMovementListFilter): Promise<DomainStockMovement[]> {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        ...(filter?.productId ? { productId: filter.productId } : {}),
        ...(filter?.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(movementToDomain);
  }
}
