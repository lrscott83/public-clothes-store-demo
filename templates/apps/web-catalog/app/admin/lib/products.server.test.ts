import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listProducts, createProduct, getProduct, updateProduct, softDeleteProduct, uploadProductImage } from './products.server';
import { createSession } from '../../shared/lib/session.server';
import type { AdminProductDto, CreateProductInput } from './admin-api.types';

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

async function sessionRequest() {
  const created = await createSession('access-1', 'refresh-1', 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request('http://ignored/admin/productos', { headers: { Cookie: cookie } });
}

describe('products.server', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalApiUrl = process.env.API_SALESOPS_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_SALESOPS_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_SALESOPS_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('listProducts requests includeInactive=true so soft-deleted rows stay visible to the admin', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([PRODUCT]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listProducts(request, 'company-1');

    expect(result).toEqual([PRODUCT]);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/products?includeInactive=true');
  });

  it('getProduct fetches by id', async () => {
    const request = await sessionRequest();
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(PRODUCT), { status: 200 })) as unknown as typeof fetch;

    const result = await getProduct(request, 'company-1', 'product-1');

    expect(result).toEqual(PRODUCT);
  });

  it('createProduct POSTs the input as JSON', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(PRODUCT), { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const input: CreateProductInput = {
      name: 'Remera Oversize',
      description: 'Remera de algodón 100%.',
      price: { amount: '100.00', currency: 'USD' },
      cost: { amount: '50.00', currency: 'USD' },
      categoryId: 'cat-1',
      image: 'products/remera.jpg',
      order: 1,
    };

    const result = await createProduct(request, 'company-1', input);

    expect(result).toEqual(PRODUCT);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('updateProduct PATCHes the input as JSON', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(PRODUCT), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await updateProduct(request, 'company-1', 'product-1', { name: 'Nuevo nombre' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/products/product-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Nuevo nombre' });
  });

  it('softDeleteProduct DELETEs by id', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'product-1' }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await softDeleteProduct(request, 'company-1', 'product-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/products/product-1');
    expect(init.method).toBe('DELETE');
  });

  it('uploadProductImage POSTs a multipart FormData, field "image", to /products/:id/image', async () => {
    const request = await sessionRequest();
    const uploaded: AdminProductDto = { ...PRODUCT, image: 'products/new-ref.webp' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(uploaded), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.set('image', file);

    const result = await uploadProductImage(request, 'company-1', 'product-1', formData);

    expect(result).toEqual(uploaded);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/products/product-1/image');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('image')).toBe(file);
    // No explicit Content-Type — fetch must set the multipart boundary itself.
    const headers = new Headers(init.headers);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('uploadProductImage throws the raw Response on a non-ok result (e.g. 400 invalid image)', async () => {
    const request = await sessionRequest();
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 })) as unknown as typeof fetch;
    const formData = new FormData();
    formData.set('image', new File(['bytes'], 'photo.png', { type: 'image/png' }));

    await expect(uploadProductImage(request, 'company-1', 'product-1', formData)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('throws the raw Response on a non-ok result — never masks a 403/404 as success', async () => {
    const request = await sessionRequest();
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 })) as unknown as typeof fetch;

    await expect(getProduct(request, 'company-1', 'product-1')).rejects.toMatchObject({ status: 403 });
  });
});
