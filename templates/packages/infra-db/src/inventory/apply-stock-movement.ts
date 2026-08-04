import type {
  CreateStockMovementInput,
  RecordMovementResult,
  StockLevel as DomainStockLevel,
  StockMovement as DomainStockMovement,
  StockMovementType,
} from '@store-mgmt/domain';
import { NegativeStockError, movementDirection } from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';

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

function levelToDomain(row: StockLevelRow): DomainStockLevel {
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

function movementToDomain(row: StockMovementRow): DomainStockMovement {
  return {
    id: row.id,
    productId: row.productId,
    warehouseId: row.warehouseId,
    // Prisma's StockMovementType enum values are lowercase, identical to the
    // TS union — identity mapping, no translation table needed.
    type: row.type as StockMovementType,
    reason: row.reason,
    quantity: row.quantity,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/**
 * Mutates `StockLevel.onHand` and appends a `StockMovement` row. Extracted
 * from `PrismaStockMovementRepository.record` (backend-ventas, Phase 4) so
 * `PrismaOrderRepository.deliver` can reuse the SAME guarded `onHand` UPDATE
 * for the `sale_out` step INSIDE its own order `$transaction` — mirrors
 * `applyReservationTx`'s extraction for `reserved` (design.md decision #4/
 * #7). Runs INSIDE an already-open Prisma transaction (`tx`) supplied by the
 * caller — never opens its own `$transaction`, so it composes cleanly inside
 * a bigger aggregate transaction as well as standalone
 * (`PrismaStockMovementRepository.record`, which wraps it in its own
 * `$transaction`). Behavior is IDENTICAL to the pre-extraction inline code —
 * this is a pure refactor, verified zero-regression by the pre-existing
 * `prisma-stock-movement.repository.spec.ts` staying green.
 *
 * `tx` is typed against `generated/tenant`'s `Prisma.TransactionClient` —
 * see `apply-reservation.ts`'s doc comment for why this and
 * `PrismaOrderRepository`'s client swap must land together (task 6.2), and
 * why `PrismaStockMovementRepository`/`PrismaStockLevelRepository` pick up
 * the matching swap in 6.3, the very next commit.
 *
 * 1. `upsert` the `StockLevel` row on `UNIQUE(productId, warehouseId)` —
 *    lazily creates it at `{onHand:0, reserved:0}` on the first movement.
 * 2. A GUARDED conditional `UPDATE ... WHERE on_hand + delta >= 0` —
 *    race-free without explicit row locks: 0 affected rows means the
 *    movement would drive `onHand` negative -> `NegativeStockError`.
 * 3. `INSERT` the append-only `StockMovement` row.
 */
export async function applyStockMovementTx(
  tx: Prisma.TransactionClient,
  input: CreateStockMovementInput,
): Promise<RecordMovementResult> {
  const delta = movementDirection(input.type) * input.quantity;

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

  const affected = await tx.$executeRaw(
    Prisma.sql`UPDATE "stock_level" SET "on_hand" = "on_hand" + ${delta}, "updated_at" = now() WHERE "id" = ${level.id} AND "on_hand" + ${delta} >= 0`,
  );

  if (affected === 0) {
    throw new NegativeStockError(
      `Movement ${input.type} of ${input.quantity} would drive onHand negative (have ${level.onHand})`,
    );
  }

  const movementRow = await tx.stockMovement.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason ?? null,
      createdBy: input.createdBy ?? null,
    },
  });

  const updatedLevel = await tx.stockLevel.findUniqueOrThrow({ where: { id: level.id } });

  return {
    movement: movementToDomain(movementRow),
    stockLevel: levelToDomain(updatedLevel),
  };
}
