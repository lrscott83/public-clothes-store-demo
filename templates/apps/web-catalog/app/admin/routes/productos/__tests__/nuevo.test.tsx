import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { action, NuevoProductoPage, parseProductFormData } from '../nuevo';
import { createSession } from '../../../../shared/lib/session.server';

// A fresh Response per call — a shared instance's body stream can only be
// read once, and reusing one across mock calls throws "Body has already
// been read" the second time `resolveCompanyId` calls `.json()` on it.
function companyLookupResponse() {
  return new Response(JSON.stringify({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' }), {
    status: 200,
  });
}

async function adminRequest(url = 'http://ignored/admin/productos/nuevo') {
  const created = await createSession(freshJwt(), 'refresh-nuevo', 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request(url, { headers: { Cookie: cookie, host: 'default.localhost:3010' } });
}

function freshJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
  return `${header}.${payload}.`;
}

function formRequest(request: Request, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request(request.url, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

const VALID_FIELDS = {
  name: 'Remera Oversize',
  description: 'Remera de algodón 100%.',
  categoryId: 'cat-1',
  order: '1',
  priceAmount: '100.00',
  priceCurrency: 'USD',
  costAmount: '50.00',
  costCurrency: 'USD',
  image: 'products/remera.jpg',
};

describe('parseProductFormData', () => {
  it('drops empty optional fields rather than sending empty strings', () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(VALID_FIELDS)) {
      formData.set(key, value);
    }

    const input = parseProductFormData(formData);

    expect(input).not.toHaveProperty('sku');
    expect(input).not.toHaveProperty('barcode');
    expect(input.name).toBe('Remera Oversize');
    expect(input.price).toEqual({ amount: '100.00', currency: 'USD' });
  });
});

describe('nuevo action', () => {
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

  it('creates the product and redirects to /admin/productos on success', async () => {
    const request = formRequest(await adminRequest(), VALID_FIELDS);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'product-1' }), { status: 201 }));
    }) as unknown as typeof fetch;

    const response = (await action({ request, params: {}, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/productos');
  });

  it('returns a permission error and does NOT redirect when api-salesops rejects with 403', async () => {
    const request = formRequest(await adminRequest(), VALID_FIELDS);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(null, { status: 403 }));
    }) as unknown as typeof fetch;

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
  });
});

describe('NuevoProductoPage', () => {
  it('renders required fields', () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <NuevoProductoPage categories={[]} /> },
    ]);
    render(<Stub />);

    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Imagen (ruta)')).toBeInTheDocument();
  });
});
