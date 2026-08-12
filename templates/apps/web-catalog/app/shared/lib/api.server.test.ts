import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeAuthenticatedRequest } from './api.server';
import { createSession, getSession } from './session.server';

/**
 * Admin API client to `api-salesops` (design.md D7: authorization is
 * resolved server-side by `api-salesops`, this app carries no authoritative
 * copy of it). Task 6.3's three behaviors: attach the session's access
 * token as a Bearer header, refresh once and retry on a 401, and destroy
 * the session if the retry also 401s — the refresh token itself is dead.
 */
/**
 * `refreshToken` must be unique per test: `refreshSession`'s de-dupe cache
 * (session.test.ts) is keyed by the OLD refresh token at module scope, so
 * two tests reusing the same value would have the second one silently
 * reuse the first's cached (and already-consumed) mock response.
 */
async function sessionRequest(refreshToken: string, url = 'http://ignored/admin/productos') {
  const created = await createSession('access-1', refreshToken, 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request(url, { headers: { Cookie: cookie } });
}

describe('makeAuthenticatedRequest', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalApiUrl = process.env.API_SALESOPS_URL;
  const originalIdpUrl = process.env.API_IDP_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_SALESOPS_URL = 'http://localhost:3001';
    process.env.API_IDP_URL = 'http://localhost:3002';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_SALESOPS_URL = originalApiUrl;
    process.env.API_IDP_URL = originalIdpUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('attaches the session access token as a Bearer header and the resolved X-Company-Id', async () => {
    const request = await sessionRequest('refresh-attach');
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await makeAuthenticatedRequest(request, 'company-1', '/products');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/products');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer access-1');
    expect((init.headers as Headers).get('X-Company-Id')).toBe('company-1');
  });

  it('refreshes exactly once on a 401 and retries with the new access token', async () => {
    const request = await sessionRequest('refresh-retry-success');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // first api-salesops call
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-2', refreshToken: 'refresh-2' }), {
          status: 200,
        }),
      ) // api-idp refresh
      .mockResolvedValueOnce(new Response('ok', { status: 200 })); // retried api-salesops call
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await makeAuthenticatedRequest(request, 'company-1', '/products');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3002/auth/refresh');
    const retryInit = fetchMock.mock.calls[2][1];
    expect((retryInit.headers as Headers).get('Authorization')).toBe('Bearer access-2');
    expect(response.status).toBe(200);
  });

  it('destroys the session and throws 401 when the retry also 401s (dead refresh token)', async () => {
    const request = await sessionRequest('refresh-retry-still-401');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-2', refreshToken: 'refresh-2' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    let caught: Response | undefined;
    try {
      await makeAuthenticatedRequest(request, 'company-1', '/products');
    } catch (err) {
      caught = err as Response;
    }

    expect(caught?.status).toBe(401);
    const clearCookie = caught?.headers.get('Set-Cookie') ?? '';
    expect(clearCookie).toMatch(/Expires=/i);

    const afterDestroy = new Request(request.url, { headers: { Cookie: clearCookie } });
    expect(await getSession(afterDestroy)).toBeNull();
  });

  it('destroys the session and throws 401 when the refresh call itself fails', async () => {
    const request = await sessionRequest('refresh-idp-rejects');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // api-idp rejects the refresh token
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(makeAuthenticatedRequest(request, 'company-1', '/products')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws 401 immediately, with no fetch at all, when there is no session', async () => {
    const request = new Request('http://ignored/admin/productos');
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(makeAuthenticatedRequest(request, 'company-1', '/products')).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes through a non-401 error response unchanged — the caller decides how to handle it', async () => {
    const request = await sessionRequest('refresh-passthrough');
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('server error', { status: 500 })) as unknown as typeof fetch;

    const response = await makeAuthenticatedRequest(request, 'company-1', '/products');
    expect(response.status).toBe(500);
  });
});
