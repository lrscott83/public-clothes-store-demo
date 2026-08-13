import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPublicProducts,
  fetchPublicProduct,
  fetchPublicCategories,
  resolveImageUrl,
} from './public-api.server';

/**
 * Thin server-to-server client to `api-public` (design.md §1: "the browser
 * NEVER calls an API"). Forwards the resolved tenant's Host as
 * `X-Forwarded-Host` (design D2: the guard prefers it over `Host`), so
 * `web-catalog` and `api-public` always agree on which store answers,
 * even though `api-public` runs on its own origin/port.
 */
describe('resolveImageUrl', () => {
  const originalEnv = process.env.API_PUBLIC_URL;

  afterEach(() => {
    process.env.API_PUBLIC_URL = originalEnv;
  });

  it('leaves an already-absolute imageUrl untouched (PUBLIC_ASSET_BASE_URL was set on api-public)', () => {
    expect(resolveImageUrl('https://cdn.example.com/products/a.webp')).toBe(
      'https://cdn.example.com/products/a.webp',
    );
  });

  it('prefixes a relative imageUrl with API_PUBLIC_URL — the browser cannot resolve it against web-catalog\'s own origin', () => {
    process.env.API_PUBLIC_URL = 'http://localhost:3003';
    expect(resolveImageUrl('/public/products/abc/image/def.webp')).toBe(
      'http://localhost:3003/public/products/abc/image/def.webp',
    );
  });

  it('passes null through unchanged — a product with no image has nothing to resolve', () => {
    expect(resolveImageUrl(null)).toBeNull();
  });
});

describe('public-api.server fetch client', () => {
  const originalEnv = process.env.API_PUBLIC_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.API_PUBLIC_URL = 'http://localhost:3003';
  });

  afterEach(() => {
    process.env.API_PUBLIC_URL = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetchPublicProducts forwards the query string verbatim and the Host as X-Forwarded-Host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: '1', imageUrl: '/public/products/1/image/x.webp' }],
          page: 1,
          pageSize: 12,
          total: 1,
          pageCount: 1,
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const searchParams = new URLSearchParams({ categoria: 'remeras', orden: 'precio-asc' });
    const result = await fetchPublicProducts(searchParams, 'default.localhost:3000');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3003/public/products?categoria=remeras&orden=precio-asc');
    expect((init.headers as Record<string, string>)['X-Forwarded-Host']).toBe(
      'default.localhost:3000',
    );

    // imageUrl on each item is resolved to an absolute URL for the browser.
    expect(result.items[0].imageUrl).toBe('http://localhost:3003/public/products/1/image/x.webp');
  });

  it('fetchPublicProduct returns null on a 404 (unknown id) — never throws', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch;

    const result = await fetchPublicProduct('does-not-exist', 'default.localhost:3000');

    expect(result).toBeNull();
  });

  it('fetchPublicProduct throws for a genuine server error (never masks a 500 as "not found")', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 })) as unknown as typeof fetch;

    await expect(fetchPublicProduct('any-id', 'default.localhost:3000')).rejects.toBeInstanceOf(
      Response,
    );
  });

  it('fetchPublicCategories hits GET /public/categories with the forwarded Host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchPublicCategories('default.localhost:3000');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3003/public/categories');
    expect((init.headers as Record<string, string>)['X-Forwarded-Host']).toBe(
      'default.localhost:3000',
    );
  });
});
