import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withAuth } from './auth.guards.server';
import { createSession, getSession } from './session.server';

/**
 * `withAuth` (design.md D7): guarantees a SESSION exists and its access
 * token is fresh before the wrapped loader runs. It deliberately does NOT
 * check roles/permissions — that's resolved server-side by `api-salesops`
 * per request (`TenantContextGuard` + `Membership`), and a `403` from
 * there renders as a "no permission" page. `withRoles`/`withPublicRedirect`/
 * `withOptionalAuth` are NOT ported — no use case for them here.
 */
function freshJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
    'base64',
  );
  return `${header}.${payload}.`;
}

async function sessionRequest(refreshToken: string, url = 'http://ignored/admin') {
  const created = await createSession(freshJwt(), refreshToken, 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request(url, { headers: { Cookie: cookie, host: 'default.localhost:3010' } });
}

function companyLookupResponse() {
  return new Response(JSON.stringify({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' }), {
    status: 200,
  });
}

describe('withAuth', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalIdpUrl = process.env.API_IDP_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_IDP_URL = 'http://localhost:3002';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_IDP_URL = originalIdpUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('redirects to admin/login, with returnTo, when there is no session', async () => {
    const loader = vi.fn();
    const guarded = withAuth(loader);
    const request = new Request('http://ignored/admin/productos?categoria=remeras');

    let caught: Response | undefined;
    try {
      await guarded({ request, params: {}, context: {} } as never);
    } catch (err) {
      caught = err as Response;
    }

    expect(caught?.status).toBe(302);
    const location = caught?.headers.get('Location') ?? '';
    expect(location).toContain('/admin/login');
    expect(location).toContain(encodeURIComponent('/admin/productos?categoria=remeras'));
    expect(loader).not.toHaveBeenCalled();
  });

  it('calls the loader with the session and resolved companyId when the access token is fresh — no refresh call', async () => {
    const request = await sessionRequest('refresh-fresh');
    const loader = vi.fn().mockResolvedValue({ ok: true });
    const guarded = withAuth(loader);
    const fetchMock = vi.fn().mockResolvedValue(companyLookupResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await guarded({ request, params: {}, context: {} } as never);

    expect(result).toEqual({ ok: true });
    expect(loader.mock.calls[0][0].session.refreshToken).toBe('refresh-fresh');
    expect(loader.mock.calls[0][0].companyId).toBe('company-1');
    // Exactly one fetch — the company lookup — never a token refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3002/companies/default');
  });

  it('refreshes an expired access token before calling the loader, and propagates the new cookie', async () => {
    const created = await (async () => {
      // A session whose accessToken already reads as expired: build one
      // directly via createSession with an already-expired JWT-shaped token
      // is unnecessary — isTokenExpired treats any malformed token as
      // expired, so a plain non-JWT access token is enough to force the
      // refresh path deterministically.
      const response = await createSession('not-a-jwt', 'refresh-expired', 'user-1');
      return response.headers.get('Set-Cookie') ?? '';
    })();
    const request = new Request('http://ignored/admin', {
      headers: { Cookie: created, host: 'default.localhost:3010' },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'access-2', refreshToken: 'refresh-2' }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(companyLookupResponse());
    }) as unknown as typeof fetch;

    const loader = vi.fn().mockResolvedValue({ ok: true });
    const guarded = withAuth(loader);

    const result = (await guarded({ request, params: {}, context: {} } as never)) as {
      data: unknown;
      init?: { headers?: Record<string, string> };
    };

    // withAuth wraps the loader's return in react-router's `data()` helper
    // when it refreshed the token, so the new cookie reaches the browser
    // even though the loader itself returned plain data, not a Response.
    expect(result.data).toEqual({ ok: true });
    expect(result.init?.headers?.['Set-Cookie']).toBeTruthy();
    expect(loader.mock.calls[0][0].session.accessToken).toBe('access-2');
    expect(loader.mock.calls[0][0].companyId).toBe('company-1');
  });

  it('destroys the session and redirects to login when the refresh fails', async () => {
    const created = await createSession('not-a-jwt', 'refresh-dead', 'user-1');
    const cookie = created.headers.get('Set-Cookie') ?? '';
    const request = new Request('http://ignored/admin', { headers: { Cookie: cookie } });

    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 })) as unknown as typeof fetch;

    const loader = vi.fn();
    const guarded = withAuth(loader);

    let caught: Response | undefined;
    try {
      await guarded({ request, params: {}, context: {} } as never);
    } catch (err) {
      caught = err as Response;
    }

    expect(caught?.status).toBe(302);
    expect(caught?.headers.get('Location')).toContain('/admin/login');
    const clearCookie = caught?.headers.get('Set-Cookie') ?? '';
    expect(clearCookie).toMatch(/Expires=/i);
    expect(loader).not.toHaveBeenCalled();

    const afterDestroy = new Request(request.url, { headers: { Cookie: clearCookie } });
    expect(await getSession(afterDestroy)).toBeNull();
  });
});
