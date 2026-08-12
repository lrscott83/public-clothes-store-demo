import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCompanyId } from './company.server';

/**
 * Resolves the tenant's `companyId` from its subdomain slug, to send as
 * `X-Company-Id` on every `api-salesops` call (design gap found in task
 * 6.5: `TenantContextGuard` needs it explicitly — its fallback to the
 * caller's SOLE active membership is ambiguous once an admin belongs to
 * >1 company, per catalog-admin spec's "no store-switcher" scenario).
 * Calls `api-idp`'s `GET /companies/:slug` (`JwtAuthGuard` only).
 */
describe('resolveCompanyId', () => {
  const originalIdpUrl = process.env.API_IDP_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.API_IDP_URL = 'http://localhost:3002';
  });

  afterEach(() => {
    process.env.API_IDP_URL = originalIdpUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves the slug to a companyId, sending the access token as Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' }), {
        status: 200,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const companyId = await resolveCompanyId('default', 'access-1');

    expect(companyId).toBe('company-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3002/companies/default');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('throws for an unknown slug — a 404 here means static config and the DB have drifted', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch;

    await expect(resolveCompanyId('ghost', 'access-1')).rejects.toThrow();
  });
});
