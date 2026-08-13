import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  softDeleteCategory,
  uploadCategoryImage,
  deleteCategoryImage,
} from './categories.server';
import { createSession } from '../../shared/lib/session.server';
import type { AdminCategoryDto, CreateCategoryInput } from './admin-api.types';

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

async function sessionRequest() {
  const created = await createSession('access-1', 'refresh-1', 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request('http://ignored/admin/productos', { headers: { Cookie: cookie } });
}

describe('categories.server', () => {
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

  it('listCategories fetches /categories with the resolved companyId', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([CATEGORY]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listCategories(request, 'company-1');

    expect(result).toEqual([CATEGORY]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories');
    expect((init.headers as Headers).get('X-Company-Id')).toBe('company-1');
  });

  it('getCategory fetches by id', async () => {
    const request = await sessionRequest();
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(CATEGORY), { status: 200 })) as unknown as typeof fetch;

    const result = await getCategory(request, 'company-1', 'cat-1');

    expect(result).toEqual(CATEGORY);
  });

  it('createCategory POSTs the input as JSON', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(CATEGORY), { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const input: CreateCategoryInput = { name: 'Remeras', slug: 'remeras', order: 1 };

    const result = await createCategory(request, 'company-1', input);

    expect(result).toEqual(CATEGORY);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('updateCategory PATCHes the input as JSON', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(CATEGORY), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await updateCategory(request, 'company-1', 'cat-1', { name: 'Remeras Nuevas' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories/cat-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Remeras Nuevas' });
  });

  it('softDeleteCategory DELETEs by id', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'cat-1' }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await softDeleteCategory(request, 'company-1', 'cat-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories/cat-1');
    expect(init.method).toBe('DELETE');
  });

  it('throws the raw Response on a non-ok result — never masks a 403/404 as success', async () => {
    const request = await sessionRequest();
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 })) as unknown as typeof fetch;

    await expect(getCategory(request, 'company-1', 'cat-1')).rejects.toMatchObject({ status: 403 });
  });

  it('uploadCategoryImage POSTs a multipart FormData, field "image", to /categories/:id/image', async () => {
    const request = await sessionRequest();
    const uploaded: AdminCategoryDto = { ...CATEGORY, image: 'categories/new-ref.webp' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(uploaded), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.set('image', file);

    const result = await uploadCategoryImage(request, 'company-1', 'cat-1', formData);

    expect(result).toEqual(uploaded);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories/cat-1/image');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('image')).toBe(file);
    // No explicit Content-Type — fetch must set the multipart boundary itself.
    const headers = new Headers(init.headers);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('uploadCategoryImage throws the raw Response on a non-ok result (e.g. 400 invalid image)', async () => {
    const request = await sessionRequest();
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 })) as unknown as typeof fetch;
    const formData = new FormData();
    formData.set('image', new File(['bytes'], 'photo.png', { type: 'image/png' }));

    await expect(uploadCategoryImage(request, 'company-1', 'cat-1', formData)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('deleteCategoryImage DELETEs /categories/:id/image', async () => {
    const request = await sessionRequest();
    const cleared: AdminCategoryDto = { ...CATEGORY, image: null };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(cleared), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await deleteCategoryImage(request, 'company-1', 'cat-1');

    expect(result).toEqual(cleared);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories/cat-1/image');
    expect(init.method).toBe('DELETE');
  });

  it('deleteCategoryImage throws the raw Response on a non-ok result', async () => {
    const request = await sessionRequest();
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch;

    await expect(deleteCategoryImage(request, 'company-1', 'cat-1')).rejects.toMatchObject({ status: 404 });
  });
});
