/**
 * Slug of the single demo tenant provisioned by `prisma/seed.js` (task
 * 14.2, `provisionCompany`) — the lookup key, not display text.
 *
 * Historical note: this used to also back an idempotent `seedCompany`/
 * `ensureDefaultCompanyId`/`seedCompanyUser` trio that upserted a Company
 * row directly against the pre-split monolith schema, with no tenant
 * schema, Membership, or tenant CompanyUser involved at all (multi-tenant-
 * by-schema did not exist yet). Deleted in task 14.2 — `provisionCompany`
 * (`company/provision-company.ts`) now owns Company creation end to end
 * (master row, schema, Membership, owner CompanyUser, catalog copy), and
 * `grantTenantRole` (`company/grant-tenant-role.ts`) owns the
 * Membership+CompanyUser write pair the old `seedCompanyUser` used to do
 * as a single legacy `company_user` row.
 */
export const DEFAULT_COMPANY_SLUG = 'default';
export const DEFAULT_COMPANY_NAME = 'Tienda Prueba';
