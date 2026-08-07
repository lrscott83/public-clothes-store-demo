import { Injectable } from '@nestjs/common';
import type {
  CreateStockMovementInput,
  IStockMovementRepository,
  RecordMovementResult,
  StockMovement as DomainStockMovement,
  StockMovementListFilter,
  StockMovementType,
} from '@store-mgmt/domain';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { withTransactionErrorMapping } from '../transaction-errors.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
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
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaStockMovementRepository implements IStockMovementRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async record(input: CreateStockMovementInput): Promise<RecordMovementResult> {
    return withTransactionErrorMapping('PrismaStockMovementRepository.record', () =>
      this.tenantContext
        .getClient()
        .$transaction((tx) => applyStockMovementTx(tx, input), LOCK_TRANSACTION_BUDGET),
    );
  }

  async list(filter?: StockMovementListFilter): Promise<DomainStockMovement[]> {
    const rows = await this.tenantContext.getClient().stockMovement.findMany({
      where: {
        ...(filter?.productId ? { productId: filter.productId } : {}),
        ...(filter?.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(movementToDomain);
  }
}
