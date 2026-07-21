import { Injectable } from '@nestjs/common';
import type {
  CreateStockMovementInput,
  IStockMovementRepository,
  RecordMovementResult,
  StockLevel as DomainStockLevel,
  StockMovement as DomainStockMovement,
  StockMovementListFilter,
  StockMovementType,
} from '@store-mgmt/domain';
import { NegativeStockError, movementDirection } from '@store-mgmt/domain';
import { Prisma } from '../../generated/client/client.js';
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
 * `prisma.$transaction`:
 *   1. `upsert` the `StockLevel` row on `UNIQUE(productId, warehouseId)` —
 *      lazily creates it at `{onHand:0, reserved:0}` on the first movement.
 *   2. A GUARDED conditional `UPDATE ... WHERE on_hand + delta >= 0` —
 *      race-free without explicit row locks: a losing concurrent writer
 *      affects 0 rows and throws `NegativeStockError`. The DB `CHECK
 *      (on_hand >= 0 AND reserved >= 0)` constraint is defense-in-depth.
 *   3. `INSERT` the append-only `StockMovement` row.
 * All three steps commit or roll back together — a rejected movement
 * persists neither the level change nor the movement row.
 */
@Injectable()
export class PrismaStockMovementRepository implements IStockMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CreateStockMovementInput): Promise<RecordMovementResult> {
    const delta = movementDirection(input.type) * input.quantity;

    return this.prisma.$transaction(async (tx) => {
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
    });
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
