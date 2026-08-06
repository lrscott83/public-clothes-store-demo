import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';

/**
 * The demo carrier catalog. `coversWarehouseNames` is data, not an enum —
 * mirrors `inventory/seed.ts`'s `WAREHOUSE_NAMES` precedent — and is joined
 * against whatever warehouses `seedWarehouses` already created, by name.
 * `Transportes del Valle` deliberately gets ZERO coverage rows, so a fresh
 * demo tenant exercises the "zero coverage rows means no declared coverage"
 * reading (spec: "Zero coverage rows means the carrier serves no
 * warehouse") without any manual setup.
 */
const CARRIERS = [
  { name: 'Envíos Rápidos', phone: '+53 5 555 0101', coversWarehouseNames: ['Pinar del Río', 'Herradura'] },
  { name: 'Transportes del Valle', phone: null, coversWarehouseNames: [] },
] as const;

export interface SeedCarriersResult {
  readonly carriersUpserted: number;
  readonly coverageRowsUpserted: number;
}

/**
 * Idempotent seed of the demo carrier catalog + coverage, keyed on `name`
 * (the natural key — `Carrier.name` has no DB-level unique constraint,
 * mirroring `seedWarehouses`'s find-then-create-or-update pattern, not a
 * native Prisma `upsert`). Re-running never duplicates rows.
 *
 * Takes the tenant client directly, not `TenantContextService` — mirrors
 * `seedWarehouses`'s precedent of taking an already-resolved client rather
 * than resolving one itself, since seed-time callers may not have an ALS
 * scope open. NOT wired into `prisma/seed.js`'s orchestration by this
 * phase — no task in this change's `tasks.md` calls for that wiring, so
 * this stays an available, tested seed function pending that decision.
 */
export async function seedCarriers(prisma: TenantPrismaClient): Promise<SeedCarriersResult> {
  let coverageRowsUpserted = 0;

  for (const carrierSpec of CARRIERS) {
    const existing = await prisma.carrier.findFirst({ where: { name: carrierSpec.name } });
    const carrier = existing
      ? await prisma.carrier.update({
          where: { id: existing.id },
          data: { active: true, phone: carrierSpec.phone },
        })
      : await prisma.carrier.create({
          data: { name: carrierSpec.name, phone: carrierSpec.phone, active: true },
        });

    for (const warehouseName of carrierSpec.coversWarehouseNames) {
      const warehouse = await prisma.warehouse.findFirst({ where: { name: warehouseName } });
      if (!warehouse) continue; // seedWarehouses hasn't run yet, or the name changed — skip rather than fail loud on demo data
      const existingCoverage = await prisma.carrierWarehouse.findUnique({
        where: { carrierId_warehouseId: { carrierId: carrier.id, warehouseId: warehouse.id } },
      });
      if (!existingCoverage) {
        await prisma.carrierWarehouse.create({
          data: { carrierId: carrier.id, warehouseId: warehouse.id },
        });
        coverageRowsUpserted++;
      }
    }
  }

  return { carriersUpserted: CARRIERS.length, coverageRowsUpserted };
}
