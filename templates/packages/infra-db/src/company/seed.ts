import type { PrismaService } from '../prisma-client.js';

/**
 * Slug of the single implicit tenant seeded here — MUST stay in lockstep
 * with migration 001's seed row (`prisma/migrations/*_add_company_and_company_user`)
 * so a fresh DB (seeded via this script) and an existing DB (backfilled via
 * the migration) converge on the same row instead of ending up with two
 * `Company` rows. The name/slug pair is a PLACEHOLDER (design.md §11 open
 * question) — the owner must confirm before this runs against a real
 * environment.
 */
export const DEFAULT_COMPANY_SLUG = 'default';
const DEFAULT_COMPANY_NAME = 'Tienda Principal';

export interface SeedCompanyResult {
  readonly companiesUpserted: number;
}

/**
 * Idempotent seed of the single implicit tenant, keyed on `slug` (upsert).
 * Re-running never duplicates rows. Mirrors `users/seed.ts`'s
 * upsert-by-natural-key convention.
 */
export async function seedCompany(prisma: PrismaService): Promise<SeedCompanyResult> {
  await prisma.company.upsert({
    where: { slug: DEFAULT_COMPANY_SLUG },
    update: {},
    create: { name: DEFAULT_COMPANY_NAME, slug: DEFAULT_COMPANY_SLUG },
  });

  return { companiesUpserted: 1 };
}
