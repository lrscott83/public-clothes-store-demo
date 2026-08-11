/**
 * Pure, Nest-free (design.md D2/D3): resolves the tenant slug from a
 * request's Host/X-Forwarded-Host headers. Never throws and never touches
 * the database — every rejection returns `null`, and it is the CALLER
 * (`PublicTenantGuard`, 4.3/4.4) that turns every `null` into the same
 * generic 404 (D4: a malformed host must not be distinguishable from an
 * unknown or inactive tenant).
 *
 * ```
 * X-Forwarded-Host ?? Host        → strip port, lowercase
 *   → labels = split('.')         → labels.length < 2                → null
 *   → slug = labels[0]            → reserved ('www','api','admin')   → null
 *                                  → !/^[a-z0-9][a-z0-9-]{0,62}$/    → null
 * ```
 */

/** Reserved for non-tenant routing — never a valid tenant slug. */
const RESERVED_LABELS = new Set(['www', 'api', 'admin']);

/** D2's slug grammar for the first Host label. */
const SLUG_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function resolveHostSlug(
  host: string | undefined,
  forwardedHost: string | undefined,
): string | null {
  const raw = forwardedHost ?? host;
  if (!raw) {
    return null;
  }

  const withoutPort = stripPort(raw);
  const labels = withoutPort.toLowerCase().split('.').filter((label) => label.length > 0);
  if (labels.length < 2) {
    return null;
  }

  const slug = labels[0];
  if (RESERVED_LABELS.has(slug) || !SLUG_LABEL_PATTERN.test(slug)) {
    return null;
  }

  return slug;
}

/**
 * `label.label:port` is the only shape this app's dev/prod Host headers take
 * (subdomain-per-tenant, see design.md §1) — a bare `lastIndexOf(':')` split
 * is correct here and deliberately does not attempt to handle a bracketed
 * IPv6 literal, which is out of scope for a subdomain-resolved tenant.
 */
function stripPort(hostHeader: string): string {
  const colonIndex = hostHeader.lastIndexOf(':');
  return colonIndex === -1 ? hostHeader : hostHeader.slice(0, colonIndex);
}
