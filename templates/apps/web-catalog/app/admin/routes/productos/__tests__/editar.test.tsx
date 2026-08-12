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

async function adminRequest(refreshToken: string, url = 'http://ignored/admin/productos/product-1/editar') {
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

/**
 * A real multipart-encoded `Request` round-tripped through `.formData()`
 * hits cross-realm `File`/`FormData` mismatches between jsdom's fetch
 * globals and Node's (undici) — not something this app's code controls.
 * `formData()` is overridden directly on the (still real, real headers/url)
 * `Request` instance so the action under test sees the exact `FormData` a
 * browser's multipart body would parse into, without depending on either
 * environment's multipart wire-format parser.
 */
function uploadImageFormRequest(request: Request, file: File) {
  const formData = new FormData();
  formData.set('intent', 'upload-image');
  formData.set('image', file);
  const req = new Request(request.url, {
    method: 'POST',
    headers: Object.fromEntries(request.headers),
  });
  Object.defineProperty(req, 'formData', { value: async () => formData });
  return req;
}

function updateFormRequest(request: Request) {
  const body = new URLSearchParams({
    name: 'Remera Oversize (editada)',
    description: 'Remera de algodón 100%.',
    categoryId: 'cat-1',
    order: '1',
    priceAmount: '120.00',
    priceCurrency: 'USD',
    costAmount: '55.00',
    costCurrency: 'USD',
    image: 'products/remera.jpg',
  });
  return new Request(request.url, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * The explicit done-criterion for task 6.5: "cross-company mutation test
 * asserts rejection, never silent apply to either company." `companyId`
 * always comes from `withAuth`'s own resolution of THIS subdomain — never
 * from user input — so the only way a mutation could ever cross a company
 * boundary is if `api-salesops`'s `TenantContextGuard` rejects it (the
 * admin's session has no ACTIVE membership in `companyId`, per
 * catalog-admin spec's "Cross-company mutation attempt is rejected"
 * scenario). These tests prove `editar.tsx`'s action treats that 403 as a
 * genuine failure — never a redirect, never a partial success — for BOTH
 * the update and the soft-delete mutation.
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

  it('an update attempt on a product outside the caller\'s company is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-update-403');
    const request = updateFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      // api-salesops's TenantContextGuard: caller has no ACTIVE membership
      // in the resolved companyId -> 403, never a cross-company fallback.
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'product-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
    // Never a Response (redirect) — a plain error object is the ONLY way
    // this action signals "not applied."
    expect(result).not.toBeInstanceOf(Response);
    const [, updateInit] = fetchMock.mock.calls[1];
    expect(updateInit.method).toBe('PATCH');
  });

  it('a soft-delete attempt on a product outside the caller\'s company is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-delete-403');
    const request = deleteFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'product-1' }, context: {} } as never);

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
      return Promise.resolve(new Response(JSON.stringify({ id: 'product-1' }), { status: 200 }));
    }) as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'product-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/productos');
  });

  it('a same-company soft-delete still succeeds and redirects', async () => {
    const base = await adminRequest('refresh-delete-200');
    const request = deleteFormRequest(base);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'product-1' }), { status: 200 }));
    }) as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'product-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/productos');
  });
});

/**
 * Task 6.7's done-criterion: "a successful upload updates the product's
 * displayed image." The action redirects back to THIS SAME edit route
 * (not the list) so the loader re-fetches the product and its `image`
 * ref reflects whatever `api-salesops` just stored — never the list page,
 * which would hide the result from the admin who just uploaded it.
 */
describe('editar action — image upload (task 6.7)', () => {
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

  it('a successful upload POSTs multipart to /products/:id/image and redirects back to the same edit route', async () => {
    const base = await adminRequest('refresh-upload-200');
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const request = uploadImageFormRequest(base, file);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'product-1', image: 'products/new-ref.webp' }), { status: 200 }),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'product-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/productos/product-1/editar');
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadUrl).toBe('http://localhost:3001/products/product-1/image');
    expect(uploadInit.method).toBe('POST');
    expect((uploadInit.body as FormData).get('image')).toBeInstanceOf(File);
  });

  it('a cross-company upload attempt is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-upload-403');
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const request = uploadImageFormRequest(base, file);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(null, { status: 403 }));
    }) as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'product-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
    expect(result).not.toBeInstanceOf(Response);
  });

  it('an invalid image (rejected by sharp) surfaces the 400 as a form error, not a crash', async () => {
    const base = await adminRequest('refresh-upload-400');
    const file = new File(['not-an-image'], 'photo.txt', { type: 'text/plain' });
    const request = uploadImageFormRequest(base, file);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(null, { status: 400 }));
    }) as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'product-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.any(String) });
    expect(result).not.toBeInstanceOf(Response);
  });
});
