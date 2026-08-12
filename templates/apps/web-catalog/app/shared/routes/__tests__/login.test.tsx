import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { action, LoginPage } from '../login';

/**
 * `/admin/login` (design.md §6, D7/D8 — sits OUTSIDE the `_auth.tsx` layout
 * so it does not guard itself). `action` authenticates against `api-idp`
 * and never leaks whether a login exists (generic error message on any
 * failure, catalog-admin spec: "never exposes the token to the client" —
 * the token only ever travels via `createSession`'s `Set-Cookie`, never in
 * the action's returned data).
 */
function loginRequest(body: Record<string, string>, url = 'http://ignored/admin/login') {
  const formData = new URLSearchParams(body);
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
}

describe('login action', () => {
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

  it('creates a session and redirects to /admin on valid credentials, with no returnTo', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 'user-1' } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const response = (await action({
      request: loginRequest({ login: 'owner', password: 'DevPass123!' }),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin');
    expect(response.headers.get('Set-Cookie')).toBeTruthy();
  });

  it('redirects to the returnTo query param on valid credentials', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 'user-1' } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const response = (await action({
      request: loginRequest(
        { login: 'owner', password: 'DevPass123!' },
        'http://ignored/admin/login?returnTo=%2Fadmin%2Fproductos',
      ),
      params: {},
      context: {},
    } as never)) as Response;

    expect(response.headers.get('Location')).toBe('/admin/productos');
  });

  it('returns a generic error and creates no session on invalid credentials — never distinguishes the reason', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 })) as unknown as typeof fetch;

    const result = (await action({
      request: loginRequest({ login: 'owner', password: 'wrong' }),
      params: {},
      context: {},
    } as never)) as { error: string };

    expect(result.error).toBeTruthy();
    expect(result).not.toHaveProperty('accessToken');
  });
});

function renderLoginPage(error: string | undefined) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <LoginPage error={error} /> },
  ]);
  return render(<Stub />);
}

describe('LoginPage', () => {
  it('renders login and password fields', () => {
    renderLoginPage(undefined);

    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it('renders the error message when present', () => {
    renderLoginPage('Usuario o contraseña incorrectos.');

    expect(screen.getByText('Usuario o contraseña incorrectos.')).toBeInTheDocument();
  });
});
