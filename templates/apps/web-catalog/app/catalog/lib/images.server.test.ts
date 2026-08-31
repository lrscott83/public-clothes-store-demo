import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPublicProductImage } from './images.server';

describe('fetchPublicProductImage', () => {
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

  it('fetches the image from api-public with X-Forwarded-Host and returns the raw Response', async () => {
    const upstreamBody = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const upstreamResponse = new Response(upstreamBody, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchPublicProductImage('abc-123', 'photo.webp', 'default.localhost:3900');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3003/public/products/abc-123/image/photo.webp');
    expect((init.headers as Record<string, string>)['X-Forwarded-Host']).toBe(
      'default.localhost:3900',
    );
    expect(result).toBe(upstreamResponse);
  });

  it('encodes special characters in id and imageKey', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchPublicProductImage('a/b=c', 'file name.png', 'tenant.localhost:3900');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'http://localhost:3003/public/products/a%2Fb%3Dc/image/file%20name.png',
    );
  });

  it('falls back to default API_PUBLIC_URL when env var is unset', async () => {
    delete process.env.API_PUBLIC_URL;
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchPublicProductImage('1', 'x.png', 'tenant.localhost:3900');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3003/public/products/1/image/x.png');
  });
});
