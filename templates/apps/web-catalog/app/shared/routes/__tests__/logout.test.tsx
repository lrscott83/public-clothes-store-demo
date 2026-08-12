import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { action } from '../logout';
import { createSession, getSession } from '../../lib/session.server';

describe('logout action', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
  });

  it('destroys the session and redirects to /admin/login', async () => {
    const created = await createSession('access-1', 'refresh-1', 'user-1');
    const cookie = created.headers.get('Set-Cookie') ?? '';
    const request = new Request('http://ignored/admin/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    const response = (await action({ request, params: {}, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/login');
    const clearCookie = response.headers.get('Set-Cookie') ?? '';
    expect(clearCookie).toMatch(/Expires=/i);

    const afterLogout = new Request(request.url, { headers: { Cookie: clearCookie } });
    expect(await getSession(afterLogout)).toBeNull();
  });

  it('logging out with no session at all is harmless — still redirects to login', async () => {
    const request = new Request('http://ignored/admin/logout', { method: 'POST' });

    const response = (await action({ request, params: {}, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/login');
  });
});
