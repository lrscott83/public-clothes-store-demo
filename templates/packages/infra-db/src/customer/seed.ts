import type { PrismaService } from '../prisma-client.js';

/**
 * The 5 seeded demo customers, sourced from the MVP's
 * `apps/salesops-mvp/app/seed/constants.ts` `CLIENT_NAME_POOL` — Data, not
 * an enum (design.md seed plan). `documentId` is left `null` — no
 * fabricated government IDs.
 */
export const CUSTOMER_NAMES = [
  'Ana Torres',
  'Luis Pérez',
  'Marta Gómez',
  'José Díaz',
  'Yanet Cruz',
] as const;

export interface SeedCustomerResult {
  readonly customersUpserted: number;
}

/**
 * Idempotent seed of the 5 demo customers ONLY, keyed on `fullName` (the
 * natural key — `Customer.fullName` has no DB-level unique constraint per
 * the LOCKED model, so idempotency is enforced here via a
 * find-then-create-or-update, not a native Prisma `upsert`). Re-running
 * never duplicates rows. All other contact fields stay empty/null.
 */
export async function seedCustomers(prisma: PrismaService): Promise<SeedCustomerResult> {
  for (const fullName of CUSTOMER_NAMES) {
    const existing = await prisma.customer.findFirst({ where: { fullName } });
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data: { active: true } });
    } else {
      await prisma.customer.create({ data: { fullName, active: true } });
    }
  }

  return { customersUpserted: CUSTOMER_NAMES.length };
}
