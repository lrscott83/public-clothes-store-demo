import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, createRoutesStub } from 'react-router';
import { loader as platformLayoutLoader } from '../../../shared/routes/_platform';
import { createSession } from '../../../shared/lib/session.server';
import { TiendasPage, type PlatformCompanyDto } from '../tiendas';
import { TiendasNuevaPage, action as tiendasNuevaAction } from '../tiendas-nueva';

/**
 * Console session guard + list (spec: salesops-platform "Console Session
 * Guard and Non-Superadmin Handling", "Console lists stores for a superadmin
 * session"). Loaders are invoked DIRECTLY (repo convention — no full data
 * router); `global.fetch` is mocked to stand in for `api-idp`.
 */

const COMPANIES: PlatformCompanyDto[] = [
  { id: 'company-1', name: 'Urbana Ropa', slug: 'urbana', isActive: true, type: 'catalog' },
  { id: 'company-2', name: 'Pendiente SA', slug: 'pendiente', isActive: false, type: null },
];

function requestFor(path = '/tiendas', cookie?: string): Request {
  return new Request(`http://ignored${path}`, {
    headers: {
      host: 'admin.localhost:3000',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

async function loaderOutcome(request: Request): Promise<{ resolved?: unknown; redirect?: Response }> {
  try {
    return { resolved: await platformLayoutLoader({ request, params: {}, context: undefined } as never) };
  } catch (err) {
    if (err instanceof Response) {
      return { redirect: err };
    }
    throw err;
  }
}

async function sessionCookie(): Promise<string> {
  const response = await createSession('access-1', 'refresh-1', 'user-1', '/irrelevant');
  const setCookie = response.headers.get('Set-Cookie') ?? '';
  return setCookie.split(';')[0];
}

describe('/tiendas loader — session guard', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('anonymous visitor → redirect to /admin/login?returnTo=/tiendas', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;

    const { redirect } = await loaderOutcome(requestFor());

    expect(redirect).toBeDefined();
    expect(redirect!.status).toBe(302);
    expect(redirect!.headers.get('location')).toBe(`/admin/login?returnTo=${encodeURIComponent('/tiendas')}`);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('valid NON-superadmin session → the SAME redirect (same status and destination)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 })) as unknown as typeof fetch;
    const cookie = await sessionCookie();

    // Anonymous baseline.
    const anonymous = await loaderOutcome(requestFor());
    // Authenticated but not superadmin.
    const authenticated = await loaderOutcome(requestFor(undefined, cookie));

    expect(authenticated.redirect).toBeDefined();
    expect(authenticated.redirect!.status).toBe(anonymous.redirect!.status);
    expect(authenticated.redirect!.headers.get('location')).toBe(
      anonymous.redirect!.headers.get('location'),
    );
  });

  it('superadmin session → lists ALL companies via GET /platform/companies with Bearer and NO X-Company-Id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(COMPANIES), { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const cookie = await sessionCookie();

    const { resolved, redirect } = await loaderOutcome(requestFor(undefined, cookie));

    expect(redirect).toBeUndefined();
    expect(resolved).toEqual({ companies: COMPANIES });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/platform/companies');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-1');
    expect(headers.get('X-Company-Id')).toBeNull();
  });
});

describe('TiendasPage — Spanish list', () => {
  it('renders one row per company with slug and active/inactive state', () => {
    render(
      <MemoryRouter>
        <TiendasPage companies={COMPANIES} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Urbana Ropa')).toBeInTheDocument();
    expect(screen.getByText('urbana')).toBeInTheDocument();
    expect(screen.getByText('Pendiente SA')).toBeInTheDocument();
    expect(screen.getByTestId('company-status-company-1')).toHaveTextContent(/activa/i);
    expect(screen.getByTestId('company-status-company-2')).toHaveTextContent(/inactiva/i);
    expect(screen.getByRole('link', { name: /nueva tienda/i })).toHaveAttribute('href', '/tiendas/nueva');
  });

  it('renders the empty state when there are no companies', () => {
    render(
      <MemoryRouter>
        <TiendasPage companies={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no hay tiendas/i)).toBeInTheDocument();
  });
});

describe('/tiendas/nueva — form', () => {
  it('renders name, slug, type (only catalog), owner login, and temporary password fields', () => {
    const Stub = createRoutesStub([
      { path: '/tiendas/nueva', Component: () => <TiendasNuevaPage /> },
    ]);
    render(<Stub initialEntries={['/tiendas/nueva']} />);

    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
    const typeSelect = screen.getByLabelText(/tipo/i) as HTMLSelectElement;
    const options = Array.from(typeSelect.options).map((o) => o.value);
    expect(options).toEqual(['catalog']);
    expect(screen.getByLabelText(/usuario del propietario/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña temporal/i)).toBeInTheDocument();
  });

  it('submits to the platform endpoint as JSON with the session token', async () => {
    const originalSecret = process.env.SESSION_SECRET;
    const originalFetch = global.fetch;
    process.env.SESSION_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          company: { id: 'company-new', name: 'Mi Tienda', slug: 'mi-tienda', type: 'catalog' },
          ownerLogin: 'dueño',
          temporaryPassword: 'Secreto123!',
        }),
        { status: 201 },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const cookie = await sessionCookie();

    try {
      const formData = new URLSearchParams({
        name: 'Mi Tienda',
        slug: 'mi-tienda',
        type: 'catalog',
        ownerLogin: 'dueño',
        temporaryPassword: 'Secreto123!',
      });
      const request = new Request('http://ignored/tiendas/nueva', {
        method: 'POST',
        headers: {
          host: 'admin.localhost:3000',
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const result = (await tiendasNuevaAction({
        request,
        params: {},
        context: undefined,
      } as never)) as { success?: { temporaryPassword: string }; error?: string };

      expect(result.error).toBeUndefined();
      expect(result.success?.temporaryPassword).toBe('Secreto123!');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/platform/companies');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({
        name: 'Mi Tienda',
        slug: 'mi-tienda',
        type: 'catalog',
        ownerLogin: 'dueño',
        temporaryPassword: 'Secreto123!',
      });
      const headers = new Headers(init.headers);
      expect(headers.get('Authorization')).toBe('Bearer access-1');
      expect(headers.get('X-Company-Id')).toBeNull();
    } finally {
      process.env.SESSION_SECRET = originalSecret;
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });
});

// Spec: "Temporary Password Show-Once Semantics" — console side. The
// plaintext appears in EXACTLY ONE element of the success state; no other
// element or form state retains it.
describe('/tiendas/nueva — show-once success state', () => {
  function renderSuccess() {
    return render(
      <MemoryRouter>
        <TiendasNuevaPage
          success={{
            companyName: 'Mi Tienda',
            ownerLogin: 'dueño',
            temporaryPassword: 'Secreto123!',
          }}
        />
      </MemoryRouter>,
    );
  }

  it('renders the plaintext password exactly once', () => {
    renderSuccess();
    expect(screen.getAllByText('Secreto123!')).toHaveLength(1);
    // And nowhere else in the whole document — count raw occurrences.
    expect(document.body.innerHTML.split('Secreto123!').length - 1).toBe(1);
  });

  it('does NOT retain the password in any input/select/textarea value', () => {
    renderSuccess();
    const inputs = document.body.querySelectorAll('input, select, textarea');
    for (const input of inputs) {
      expect((input as HTMLInputElement).value).not.toBe('Secreto123!');
    }
  });

  it('identifies the created store and owner login in Spanish', () => {
    renderSuccess();
    expect(screen.getByText('Mi Tienda')).toBeInTheDocument();
    expect(screen.getByText('dueño')).toBeInTheDocument();
    expect(screen.getByText(/guardala en un lugar seguro/i)).toBeInTheDocument();
  });
});
