import { getStoreConfig } from '../config/stores';
import type { StoreConfig } from '../config/stores/types';
import { getRequestHostSlug } from './tenant.server';

/**
 * Resolves this request's `StoreConfig` from its Host header (design.md D9).
 * Mirrors `api-public`'s `PublicTenantGuard` (D4): an unresolvable Host and a
 * well-formed slug with no matching config are the SAME 404 — never a hint
 * about which case occurred. Called from every route's own `loader` (root,
 * home, `/productos`, `/productos/:id`) — cheap, synchronous, no I/O, so
 * re-resolving per route costs nothing and keeps each loader independent,
 * the same way `api-public`'s guard re-resolves per request rather than
 * sharing ambient state (design D2).
 */
export function resolveStoreConfig(request: Request): StoreConfig {
  const slug = getRequestHostSlug(request);
  const config = slug ? getStoreConfig(slug) : undefined;

  if (!config) {
    throw new Response('Not Found', { status: 404 });
  }

  return config;
}
