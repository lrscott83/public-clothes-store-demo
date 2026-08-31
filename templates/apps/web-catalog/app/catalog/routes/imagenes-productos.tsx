import { fetchPublicProductImage } from '../lib/images.server';
import { getRequestHost } from '../../shared/lib/tenant.server';

/**
 * Resource route: proxies product images from `api-public` to the browser
 * on the same origin. The `<img>` runs in the browser, which cannot send
 * `X-Forwarded-Host` to `api-public` — so the fetch happens here
 * server-side, forwarding the shopper's tenant host so
 * `PublicTenantGuard` resolves the correct store (design D2).
 */
export const loader = async ({ request, params }: { request: Request; params: { id: string; imageKey: string } }) => {
  const host = getRequestHost(request);
  const upstream = await fetchPublicProductImage(params.id, params.imageKey, host);

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
