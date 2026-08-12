import { apiIdpBaseUrl } from './session.server';

interface CompanyLookupResponse {
  id: string;
}

/**
 * Resolves the tenant's `companyId` from its subdomain slug, to send as
 * `X-Company-Id` on every `api-salesops` call (design gap found in
 * public-catalog Phase 6 task 6.5: `TenantContextGuard` needs it
 * explicitly — its fallback to the caller's SOLE active membership is
 * ambiguous once an admin belongs to >1 company, per catalog-admin
 * spec's "no store-switcher" scenario). Calls `api-idp`'s
 * `GET /companies/:slug` (`JwtAuthGuard` only — resolving a slug must
 * work before any tenant is established for the request).
 *
 * A 404/error here means the static `StoreConfig` map (which already
 * validated this slug at the root loader) and the database have
 * drifted — a genuine server misconfiguration, not a user-facing 404.
 */
export async function resolveCompanyId(slug: string, accessToken: string): Promise<string> {
  const response = await fetch(`${apiIdpBaseUrl()}/companies/${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve companyId for slug "${slug}": ${response.status}`);
  }

  const { id } = (await response.json()) as CompanyLookupResponse;
  return id;
}
