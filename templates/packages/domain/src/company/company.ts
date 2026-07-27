/**
 * Company (tenant) master-data entity. Under the single-schema shape
 * (`company-user-roles-reframe`, decisions D1/D3) there is exactly one row
 * in production today; the model exists so authorization can be keyed by
 * `(userId, companyId)` instead of conflated onto `User` directly.
 *
 * `schemaName` is a nullable, RESERVED hook for the deferred
 * schema-per-tenant change (D3) — it ships ALWAYS NULL and NO code path may
 * read it. There is deliberately no `createCompany` factory here: nothing in
 * this slice creates a `Company` through domain code — the single row is
 * seeded by migration 001 and `infra-db/src/company/seed.ts` directly.
 */
export interface Company {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isActive: boolean;
  /** Reserved hook for the deferred schema-per-tenant change (D3). ALWAYS null today — no code path may read it. */
  readonly schemaName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
