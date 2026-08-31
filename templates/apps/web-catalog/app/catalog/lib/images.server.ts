const DEFAULT_API_PUBLIC_URL = 'http://localhost:3003';

function apiPublicBaseUrl(): string {
  return process.env.API_PUBLIC_URL ?? DEFAULT_API_PUBLIC_URL;
}

/**
 * Server-side proxy fetch for product images from `api-public`. The browser
 * never calls this directly — `web-catalog`'s resource route
 * (`imagenes-productos`) invokes it, forwarding the shopper's tenant host
 * so `api-public`'s `PublicTenantGuard` can resolve the correct store.
 */
export function fetchPublicProductImage(
  id: string,
  imageKey: string,
  host: string,
): Promise<Response> {
  return fetch(
    `${apiPublicBaseUrl()}/public/products/${encodeURIComponent(id)}/image/${encodeURIComponent(imageKey)}`,
    { headers: { 'X-Forwarded-Host': host } },
  );
}
