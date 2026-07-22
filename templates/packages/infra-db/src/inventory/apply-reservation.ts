import type { ReserveStockInput, StockLevel as DomainStockLevel } from '@store-mgmt/domain';
import { InsufficientStockError, InvalidStockLevelError } from '@store-mgmt/domain';
import { Prisma } from '../../generated/client/client.js';

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
 * Mutates `StockLevel.reserved` ONLY — never `onHand`, never a
 * `StockMovement` row (reservations do not move physical stock, see
 * `domain/src/inventory/stock-reservation-seam.md`). Runs INSIDE an
 * already-open Prisma transaction (`tx`) supplied by the caller — this
 * function never opens its own `$transaction`, so it composes cleanly
 * inside a bigger aggregate transaction (e.g. `PrismaOrderRepository`'s
 * confirm/deliver/cancel) as well as standalone
 * (`PrismaStockLevelRepository.reserve`/`.release`, which wrap it in their
 * own `$transaction`).
 *
 * 1. `upsert` the `StockLevel` row on `UNIQUE(productId, warehouseId)` —
 *    lazily creates it at `{onHand:0, reserved:0}` on first call, mirroring
 *    `PrismaStockMovementRepository.record`.
 * 2. A GUARDED conditional `UPDATE`, race-free without explicit row locks:
 *    - `dir='reserve'`: `SET reserved = reserved + q WHERE id=? AND on_hand - (reserved + q) >= 0`
 *      — 0 affected rows means insufficient availability -> `InsufficientStockError`.
 *    - `dir='release'`: `SET reserved = reserved - q WHERE id=? AND reserved - q >= 0`
 *      — 0 affected rows means an over-release -> `InvalidStockLevelError`.
 */
export async function applyReservationTx(
  tx: Prisma.TransactionClient,
  input: ReserveStockInput,
  dir: 'reserve' | 'release',
): Promise<DomainStockLevel> {
  const level = await tx.stockLevel.upsert({
    where: {
      productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId },
    },
    update: {},
    create: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      onHand: 0,
      reserved: 0,
    },
  });

  const affected =
    dir === 'reserve'
      ? await tx.$executeRaw(
          Prisma.sql`UPDATE "stock_level" SET "reserved" = "reserved" + ${input.quantity}, "updated_at" = now() WHERE "id" = ${level.id} AND "on_hand" - ("reserved" + ${input.quantity}) >= 0`,
        )
      : await tx.$executeRaw(
          Prisma.sql`UPDATE "stock_level" SET "reserved" = "reserved" - ${input.quantity}, "updated_at" = now() WHERE "id" = ${level.id} AND "reserved" - ${input.quantity} >= 0`,
        );

  if (affected === 0) {
    if (dir === 'reserve') {
      throw new InsufficientStockError(
        `Reserving ${input.quantity} would drive available negative (onHand=${level.onHand}, reserved=${level.reserved})`,
      );
    }
    throw new InvalidStockLevelError(
      `Releasing ${input.quantity} would drive reserved negative (reserved=${level.reserved})`,
    );
  }

  const updatedLevel = await tx.stockLevel.findUniqueOrThrow({ where: { id: level.id } });
  return toDomain(updatedLevel);
}
