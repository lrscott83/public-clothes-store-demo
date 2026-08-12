import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  getSession,
  destroySession,
  isTokenExpired,
  refreshSession,
} from './session.server';

/**
 * `web-catalog`'s admin session (design.md D8): host-only httpOnly cookie,
 * `SessionData = {accessToken, refreshToken, userId}` — no `activeCompanyId`,
 * because the subdomain already fixes the store and a switcher would
 * contradict it. `catalog-admin` spec: "Successful login never exposes the
 * token to the client" — the access token appears ONLY in the `Set-Cookie`
 * header, never in a response body a loader could serialize back to the
 * browser.
 */
function makeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
  return `${header}.${payload}.`;
}

describe('session cookie shape', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
  });

  it('sets the cookie httpOnly, sameSite=lax, and with no Domain attribute (D8, load-bearing)', async () => {
    const response = await createSession('access-1', 'refresh-1', 'user-1');
    const setCookie = response.headers.get('Set-Cookie') ?? '';

    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Domain=/i);
  });

  it('never exposes the access token in the response body — it only travels via Set-Cookie (catalog-admin spec)', async () => {
    const response = await createSession('super-secret-access-token', 'refresh-1', 'user-1');
    const body = await response.text();

    expect(body).not.toContain('super-secret-access-token');
    expect(response.headers.get('Set-Cookie')).not.toBeNull();
  });

  it('round-trips accessToken/refreshToken/userId through Set-Cookie -> Cookie, with no activeCompanyId key (D8)', async () => {
    const created = await createSession('access-1', 'refresh-1', 'user-1');
    const cookie = created.headers.get('Set-Cookie') ?? '';
    const request = new Request('http://ignored/admin', { headers: { Cookie: cookie } });

    const session = await getSession(request);

    expect(session).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', userId: 'user-1' });
    expect(session).not.toHaveProperty('activeCompanyId');
  });

  it('getSession returns null when there is no cookie', async () => {
    const request = new Request('http://ignored/admin');
    expect(await getSession(request)).toBeNull();
  });

  it('destroySession clears the cookie', async () => {
    const created = await createSession('access-1', 'refresh-1', 'user-1');
    const cookie = created.headers.get('Set-Cookie') ?? '';
    const request = new Request('http://ignored/admin', { headers: { Cookie: cookie } });

    const destroyed = await destroySession(request);
    expect(destroyed).toMatch(/Expires=/i);

    const afterDestroy = new Request('http://ignored/admin', { headers: { Cookie: destroyed } });
    expect(await getSession(afterDestroy)).toBeNull();
  });

  it('throws if SESSION_SECRET is unset — boot fails loudly, never silently insecure (D8)', async () => {
    delete process.env.SESSION_SECRET;
    await expect(createSession('a', 'r', 'u')).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe('isTokenExpired', () => {
  it('returns false for a token whose exp is well in the future', () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for a token whose exp has already passed', () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) - 3600);
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true for a token expiring within the 5s buffer', () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 2);
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true (never throws) for a malformed token', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
  });
});

describe('refreshSession de-dupe', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalEnv = process.env.API_IDP_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_IDP_URL = 'http://localhost:3002';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_IDP_URL = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('two parallel callers sharing the same expired refresh token trigger exactly one IDP call', async () => {
    const created = await createSession('access-1', 'refresh-shared', 'user-1');
    const cookie = created.headers.get('Set-Cookie') ?? '';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'access-2', refreshToken: 'refresh-2' }), {
        status: 200,
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const requestA = new Request('http://ignored/admin/a', { headers: { Cookie: cookie } });
    const requestB = new Request('http://ignored/admin/b', { headers: { Cookie: cookie } });

    const [resultA, resultB] = await Promise.all([refreshSession(requestA), refreshSession(requestB)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultA).toBe(resultB);
  });
});
