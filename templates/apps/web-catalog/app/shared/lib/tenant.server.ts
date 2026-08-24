/**
 * Anonymous tenant resolution for `web-catalog` (design.md D2/D9). Rewritten
 * from `api-public`'s `host-slug.ts` — the two apps must agree on the exact
 * same grammar (same subdomain, same request), but `web-catalog` never
 * imports another app's source, so this is new code reproducing the same
 * parse table, not a copy-paste.
 *
 * ```
 * X-Forwarded-Host ?? Host        → strip port, lowercase
 *   → labels = split('.')         → labels.length < 2                → null
 *   → slug = labels[0]            → reserved ('www','api','admin')   → null
 *                                  → !/^[a-z0-9][a-z0-9-]{0,62}$/    → null
 * ```
 *
 * Never throws and never touches the network — every rejection returns
 * `null`; the caller (`store-config.server.ts`) turns every `null` into the
 * same generic 404 (D4: a malformed host must not be distinguishable from an
 * unknown or inactive tenant).
 */

const RESERVED_LABELS = new Set(['www', 'api', 'admin']);
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
 * (subdomain-per-tenant, design.md §1) — a bare `lastIndexOf(':')` split is
 * correct here and deliberately does not attempt to handle a bracketed IPv6
 * literal, which is out of scope for a subdomain-resolved tenant.
 */
function stripPort(hostHeader: string): string {
  const colonIndex = hostHeader.lastIndexOf(':');
  return colonIndex === -1 ? hostHeader : hostHeader.slice(0, colonIndex);
}

/** Resolves the tenant slug directly off a real `Request`'s headers. */
export function getRequestHostSlug(request: Request): string | null {
  return resolveHostSlug(
    request.headers.get('host') ?? undefined,
    request.headers.get('x-forwarded-host') ?? undefined,
  );
}

/** The raw, unparsed `Host` header — forwarded to `api-public` as `X-Forwarded-Host` (public-api.server.ts) so both apps resolve the identical tenant. */
export function getRequestHost(request: Request): string {
  return request.headers.get('host') ?? '';
}

/**
 * True when this request's first host label is the reserved `admin`
 * (design D4). This is EXACTLY the label `resolveHostSlug` rejects as a
 * tenant slug — a platform-admin host can never collide with a tenant
 * storefront host. The root loader branches on this BEFORE any
 * `resolveStoreConfig` call: on an admin host, tenant/store resolution is
 * skipped entirely and only platform routes are served. Truth table:
 * labels[0]==='admin' → true; empty/missing labels or any other label →
 * false (never throws).
 */
export function isPlatformAdminHost(request: Request): boolean {
  const raw = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!raw) {
    return false;
  }

  const withoutPort = stripPort(raw);
  const labels = withoutPort.toLowerCase().split('.').filter((label) => label.length > 0);
  return labels[0] === 'admin';
}
