import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { action, NuevoProductoPage, parseProductFormData } from '../nuevo';
import { createSession } from '../../../../shared/lib/session.server';
import { ProductForm } from '../../../components/product-form';
import type { AdminCategoryDto, AdminProductDto } from '../../../lib/admin-api.types';

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

/**
 * A real multipart-encoded `Request` round-tripped through `.formData()`
 * hits cross-realm `File`/`FormData` mismatches between jsdom's fetch
 * globals and Node's (undici) — not something this app's code controls
 * (same workaround `editar.test.tsx` uses for its own upload-image test).
 * `formData()` is overridden directly on the (still real, real
 * headers/url) `Request` instance so the action under test sees the exact
 * `FormData` a browser's multipart body would parse into.
 */
function multipartRequest(request: Request, fields: Record<string, string>, file?: File) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  if (file) {
    formData.set('imageFile', file);
  }
  const req = new Request(request.url, {
    method: 'POST',
    headers: Object.fromEntries(request.headers),
  });
  Object.defineProperty(req, 'formData', { value: async () => formData });
  return req;
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
};

const CATEGORY: AdminCategoryDto = {
  id: 'cat-1',
  name: 'Remeras',
  slug: 'remeras',
  image: null,
  icon: null,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PRODUCT: AdminProductDto = {
  id: 'product-1',
  name: 'Remera Oversize',
  description: 'Remera de algodón 100%.',
  sku: null,
  barcode: null,
  price: { amount: '100.00', currency: 'USD' },
  percentDiscountPrice: '0.00',
  discountPrice: '0.00',
  cost: { amount: '50.00', currency: 'USD' },
  finalPrice: { amount: '100.00', currency: 'USD' },
  isOffer: false,
  categoryId: 'cat-1',
  image: 'products/remera.jpg',
  isNew: false,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProductForm — image', () => {
  it('offers a file picker, not a raw path field', () => {
    render(<ProductForm mode="create" categories={[CATEGORY]} submitLabel="Crear" />);

    const input = screen.getByLabelText('Imagen (opcional)') as HTMLInputElement;

    expect(input.type).toBe('file');
    expect(input.required).toBe(false);
    expect(screen.queryByPlaceholderText('products/remera.jpg')).not.toBeInTheDocument();
  });

  it('does not render an image control at all in edit mode', () => {
    render(
      <ProductForm mode="edit" categories={[CATEGORY]} submitLabel="Guardar" defaultValues={PRODUCT} />,
    );

    expect(screen.queryByLabelText('Imagen (opcional)')).not.toBeInTheDocument();
  });
});

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

  it('never carries image — the upload endpoint owns it', () => {
    const formData = new FormData();
    formData.set('name', 'Remera');
    formData.set('description', 'x');
    formData.set('categoryId', 'cat-1');
    formData.set('order', '1');
    formData.set('priceAmount', '100.00');
    formData.set('priceCurrency', 'USD');
    formData.set('costAmount', '50.00');
    formData.set('costCurrency', 'USD');
    formData.set('image', 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp');

    expect(parseProductFormData(formData)).not.toHaveProperty('image');
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

describe('action — create then upload', () => {
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

  it('creates the product first, then uploads the chosen file to its id', async () => {
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const request = multipartRequest(await adminRequest(), VALID_FIELDS, file);
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      if (url === 'http://localhost:3001/products' && init?.method === 'POST') {
        calls.push('create');
        return Promise.resolve(new Response(JSON.stringify({ id: 'new-id' }), { status: 201 }));
      }
      if (url === 'http://localhost:3001/products/new-id/image') {
        calls.push('upload');
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'new-id', image: 'products/new-ref.webp' }), { status: 200 }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = (await action({ request, params: {}, context: {} } as never)) as Response;

    expect(calls).toEqual(['create', 'upload']);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/productos');
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[2];
    expect(uploadUrl).toBe('http://localhost:3001/products/new-id/image');
    expect(uploadInit.method).toBe('POST');
    expect((uploadInit.body as FormData).get('image')).toBeInstanceOf(File);
  });

  it('does not call upload when no file was chosen', async () => {
    const request = multipartRequest(await adminRequest(), VALID_FIELDS);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'new-id' }), { status: 201 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = (await action({ request, params: {}, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    // Only the company lookup and the create call — no third call to /image.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the created product when the upload fails, and says so', async () => {
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const request = multipartRequest(await adminRequest(), VALID_FIELDS, file);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      if (url === 'http://localhost:3001/products') {
        return Promise.resolve(new Response(JSON.stringify({ id: 'new-id' }), { status: 201 }));
      }
      return Promise.resolve(new Response(null, { status: 400 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result).toEqual({
      error: 'El producto se creó, pero la imagen no se pudo subir. Podés subirla desde la edición.',
    });
  });
});

describe('NuevoProductoPage', () => {
  it('renders required fields', () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <NuevoProductoPage categories={[]} /> },
    ]);
    render(<Stub />);

    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Imagen (opcional)')).toBeInTheDocument();
  });
});
