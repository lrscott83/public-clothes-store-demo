import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { action } from '../editar';
import { createSession } from '../../../../shared/lib/session.server';

function companyLookupResponse() {
  return new Response(JSON.stringify({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' }), {
    status: 200,
  });
}

function freshJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
  return `${header}.${payload}.`;
}

async function adminRequest(refreshToken: string, url = 'http://ignored/admin/categorias/cat-1/editar') {
  const created = await createSession(freshJwt(), refreshToken, 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request(url, { headers: { Cookie: cookie, host: 'default.localhost:3010' } });
}

function deleteFormRequest(request: Request) {
  const body = new URLSearchParams({ intent: 'delete' });
  return new Request(request.url, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

function updateFormRequest(request: Request) {
  const body = new URLSearchParams({
    name: 'Remeras (editada)',
    slug: 'remeras',
    order: '1',
  });
  return new Request(request.url, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Mirrors `productos/editar.test.tsx`'s cross-company suite (task 6.5's
 * done-criterion, reused verbatim for categories per task 6.6): `companyId`
 * always comes from `withAuth`'s own resolution of THIS subdomain — never
 * from user input — so the only way a mutation could ever cross a company
 * boundary is if `api-salesops`'s `TenantContextGuard` rejects it. These
 * tests prove `editar.tsx`'s action treats that 403 as a genuine failure —
 * never a redirect, never a partial success — for BOTH update and
 * soft-delete.
 */
describe('editar action — cross-company mutation rejection', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalIdpUrl = process.env.API_IDP_URL;
  const originalApiUrl = process.env.API_SALESOPS_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_IDP_URL = 'http://localhost:3002';
    process.env.API_SALESOPS_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_IDP_URL = originalIdpUrl;
    process.env.API_SALESOPS_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('an update attempt on a category outside the caller\'s company is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-update-403');
    const request = updateFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      // api-salesops's TenantContextGuard: caller has no ACTIVE membership
      // in the resolved companyId -> 403, never a cross-company fallback.
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'cat-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
    // Never a Response (redirect) — a plain error object is the ONLY way
    // this action signals "not applied."
    expect(result).not.toBeInstanceOf(Response);
    const [, updateInit] = fetchMock.mock.calls[1];
    expect(updateInit.method).toBe('PATCH');
  });

  it('a soft-delete attempt on a category outside the caller\'s company is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-delete-403');
    const request = deleteFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'cat-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
    expect(result).not.toBeInstanceOf(Response);
    const [, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteInit.method).toBe('DELETE');
  });

  it('a same-company update still succeeds and redirects — the 403 tests above are not a blanket failure', async () => {
    const base = await adminRequest('refresh-update-200');
    const request = updateFormRequest(base);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'cat-1' }), { status: 200 }));
    }) as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'cat-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/categorias');
  });

  it('a same-company soft-delete still succeeds, redirects, and the DELETE call is the ONLY mutation issued — the row is soft-deleted (active=false) server-side, never hard-deleted', async () => {
    const base = await adminRequest('refresh-delete-200');
    const request = deleteFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'cat-1' }), { status: 200 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'cat-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/categorias');
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteUrl).toBe('http://localhost:3001/categories/cat-1');
    expect(deleteInit.method).toBe('DELETE');
  });
});
