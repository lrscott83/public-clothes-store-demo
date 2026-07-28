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

/**
 * Ensures the implicit tenant exists and returns its id. Every seed that
 * mints an `app_user` MUST call this and assign the resulting company —
 * since migration 002 drops `app_user.roles`, a user without an ACTIVE
 * `CompanyUser` has no persisted authorization at all and is rejected at
 * authentication time.
 */
export async function ensureDefaultCompanyId(prisma: PrismaService): Promise<string> {
  await seedCompany(prisma);
  const company = await prisma.company.findUniqueOrThrow({
    where: { slug: DEFAULT_COMPANY_SLUG },
  });

  return company.id;
}

/**
 * Idempotent upsert of one `(userId, companyId)` assignment, keyed on the
 * pair's UNIQUE constraint. Re-running a seed re-asserts the role bitmask
 * rather than duplicating the row.
 */
export async function seedCompanyUser(
  prisma: PrismaService,
  userId: string,
  companyId: string,
  role: number,
): Promise<void> {
  await prisma.companyUser.upsert({
    where: { userId_companyId: { userId, companyId } },
    update: { role, status: 'ACTIVE' },
    create: { userId, companyId, role, status: 'ACTIVE' },
  });
}
