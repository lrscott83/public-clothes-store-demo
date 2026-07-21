import type { PrismaService } from '../prisma-client.js';

/**
 * The 3 seeded warehouses, sourced from the MVP's
 * `apps/salesops-mvp/app/seed/constants.ts` `WAREHOUSES` list — Data, not
 * an enum (design.md seed plan). NO `StockLevel` rows are seeded (open
 * decision #8): a missing `(productId, warehouseId)` row means zero stock,
 * lazily created on the first movement.
 */
export const WAREHOUSE_NAMES = ['Pinar del Río', 'Consolación del Sur', 'Herradura'] as const;

export interface SeedInventoryResult {
  readonly warehousesUpserted: number;
}

/**
 * Idempotent seed of the 3 warehouses ONLY, keyed on `name` (the natural
 * key — `Warehouse.name` has no DB-level unique constraint per the LOCKED
 * schema in design.md, so idempotency is enforced here via a
 * find-then-create-or-update, not a native Prisma `upsert`). Re-running
 * never duplicates rows. NO `StockLevel` rows are ever created here.
 */
export async function seedWarehouses(prisma: PrismaService): Promise<SeedInventoryResult> {
  for (const name of WAREHOUSE_NAMES) {
    const existing = await prisma.warehouse.findFirst({ where: { name } });
    if (existing) {
      await prisma.warehouse.update({ where: { id: existing.id }, data: { active: true } });
    } else {
      await prisma.warehouse.create({ data: { name, active: true } });
    }
  }

  return { warehousesUpserted: WAREHOUSE_NAMES.length };
}
