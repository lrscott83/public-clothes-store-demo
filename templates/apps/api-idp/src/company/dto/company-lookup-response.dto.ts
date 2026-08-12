/**
 * Response shape for `GET /companies/:slug` — deliberately `{id, slug, name}`
 * ONLY, never the full `Company` row (no `schemaName`, `isActive`). Callers
 * resolve this to send as `X-Company-Id` on `api-salesops` calls; `slug`
 * and `name` are already public via the storefront, so exposing them to
 * any authenticated caller (not just members of that company) leaks
 * nothing new.
 */
export class CompanyLookupResponseDto {
  id!: string;
  slug!: string;
  name!: string;
}
