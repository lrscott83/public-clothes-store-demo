import { Injectable } from '@nestjs/common';
import type {
  IStockLevelRepository,
  ReserveStockInput,
  StockLevel as DomainStockLevel,
  StockLevelListFilter,
} from '@store-mgmt/domain';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { withTransactionErrorMapping } from '../transaction-errors.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { applyReservationTx } from './apply-reservation.js';

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
 * Prisma adapter for `IStockLevelRepository` — reads + reservation writes.
 * Physical `onHand` mutations still happen exclusively through the
 * transactional `PrismaStockMovementRepository.record` flow; this
 * repository never creates or updates `onHand` directly. `reserve`/
 * `release` are the ONLY writes exposed here, and they touch `reserved`
 * exclusively via `applyReservationTx`, each wrapped in its OWN
 * `$transaction` (see `apply-reservation.ts`). A missing
 * `(productId, warehouseId)` pair resolves to `null` on reads — the caller
 * treats that as zero stock, never an error (StockLevel rows are lazily
 * created on first movement or first reservation).
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaStockLevelRepository implements IStockLevelRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async findById(id: string): Promise<DomainStockLevel | null> {
    const row = await this.tenantContext.getClient().stockLevel.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByProductAndWarehouse(
    productId: string,
    warehouseId: string,
  ): Promise<DomainStockLevel | null> {
    const row = await this.tenantContext.getClient().stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    return row ? toDomain(row) : null;
  }

  async list(filter?: StockLevelListFilter): Promise<DomainStockLevel[]> {
    const rows = await this.tenantContext.getClient().stockLevel.findMany({
      where: {
        ...(filter?.productId ? { productId: filter.productId } : {}),
        ...(filter?.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
    });
    return rows.map(toDomain);
  }

  // Both take the same `stock_level` row locks the order transitions take, on
  // the same budget, so they can end the same two ways — a deadlock and a
  // blown budget — and get the same translation. See `transaction-errors.ts`.
  async reserve(input: ReserveStockInput): Promise<DomainStockLevel> {
    return withTransactionErrorMapping('PrismaStockLevelRepository.reserve', () =>
      this.tenantContext
        .getClient()
        .$transaction((tx) => applyReservationTx(tx, input, 'reserve'), LOCK_TRANSACTION_BUDGET),
    );
  }

  async release(input: ReserveStockInput): Promise<DomainStockLevel> {
    return withTransactionErrorMapping('PrismaStockLevelRepository.release', () =>
      this.tenantContext
        .getClient()
        .$transaction((tx) => applyReservationTx(tx, input, 'release'), LOCK_TRANSACTION_BUDGET),
    );
  }
}
