import { describe, expect, it, vi } from 'vitest';

const makeAuthenticatedRequest = vi.fn();
vi.mock('../../../../shared/lib/api.server', () => ({ makeAuthenticatedRequest }));
vi.mock('../../../../shared/lib/auth.guards.server', () => ({
  withAuth:
    (fn: (args: { request: Request; params: Record<string, string>; companyId: string }) => unknown) =>
    (args: { request: Request; params: Record<string, string> }) =>
      fn({ ...args, companyId: 'company-1' }),
}));

const { loader } = await import('../image');

describe('GET /admin/productos/:id/image', () => {
  it('proxies the upstream bytes and content type without exposing the token', async () => {
    makeAuthenticatedRequest.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const response = (await loader({
      request: new Request('http://x/admin/productos/p1/image'),
      params: { id: 'p1' },
    } as never)) as Response;

    expect(makeAuthenticatedRequest).toHaveBeenCalledWith(
      expect.anything(),
      'company-1',
      '/products/p1/image',
    );
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Authorization')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('passes an upstream 404 through as a 404', async () => {
    makeAuthenticatedRequest.mockResolvedValue(new Response(null, { status: 404 }));

    const response = (await loader({
      request: new Request('http://x/admin/productos/p1/image'),
      params: { id: 'p1' },
    } as never)) as Response;

    expect(response.status).toBe(404);
  });
});
