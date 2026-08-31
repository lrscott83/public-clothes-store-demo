import type {
  PublicCategoryDto,
  PublicProductDto,
  PublicProductListResponseDto,
} from './public-api.types';

const DEFAULT_API_PUBLIC_URL = 'http://localhost:3003';

function apiPublicBaseUrl(): string {
  return process.env.API_PUBLIC_URL ?? DEFAULT_API_PUBLIC_URL;
}

/**
 * Resolves a possibly-relative `imageUrl` (design.md §3 — relative whenever
 * `api-public`'s own `PUBLIC_ASSET_BASE_URL` is unset, the local/dev
 * default) to a same-origin proxy URL served by `web-catalog` itself
 * (`/imagenes/productos/...`). This avoids the browser hitting `api-public`
 * directly with a bare `Host` header that carries no tenant subdomain.
 * Absolute URLs (`http(s)://…`) are returned unchanged — those are the
 * prod case where `api-public` has `PUBLIC_ASSET_BASE_URL` set.
 * `null` (no image, design.md D8) passes through unchanged.
 */
export function resolveImageUrl(imageUrl: string | null): string | null {
  if (imageUrl === null) {
    return null;
  }
  if (/^https?:\/\//.test(imageUrl)) {
    return imageUrl;
  }
  const match = imageUrl.match(/^\/public\/products\/([^/]+)\/image\/(.+)$/);
  if (match) {
    return `/imagenes/productos/${match[1]}/${match[2]}`;
  }
  return imageUrl;
}

function withResolvedImage(item: PublicProductDto): PublicProductDto {
  return { ...item, imageUrl: resolveImageUrl(item.imageUrl) };
}

/**
 * Every call to `api-public` forwards the ORIGINAL inbound Host as
 * `X-Forwarded-Host` (design D2: the guard prefers it over `Host`) — this
 * app's server calls `api-public` over its own base URL
 * (`API_PUBLIC_URL`, a different origin/port), so without this header
 * `api-public` would resolve ITS OWN Host, not the shopper's tenant.
 */
async function callPublicApi(path: string, host: string): Promise<Response> {
  return fetch(`${apiPublicBaseUrl()}${path}`, {
    headers: { 'X-Forwarded-Host': host },
  });
}

function failedResponse(status: number): Response {
  return new Response('Failed to reach api-public', { status });
}

export async function fetchPublicProducts(
  searchParams: URLSearchParams,
  host: string,
): Promise<PublicProductListResponseDto> {
  const query = searchParams.toString();
  const response = await callPublicApi(`/public/products${query ? `?${query}` : ''}`, host);
  if (!response.ok) {
    throw failedResponse(response.status);
  }

  const data = (await response.json()) as PublicProductListResponseDto;
  return { ...data, items: data.items.map(withResolvedImage) };
}

/** Returns `null` for a 404 (unknown/inactive product, D9's "client-degrades gracefully") — never masks a genuine server error the same way. */
export async function fetchPublicProduct(id: string, host: string): Promise<PublicProductDto | null> {
  const response = await callPublicApi(`/public/products/${encodeURIComponent(id)}`, host);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw failedResponse(response.status);
  }

  const data = (await response.json()) as PublicProductDto;
  return withResolvedImage(data);
}

export async function fetchPublicCategories(host: string): Promise<PublicCategoryDto[]> {
  const response = await callPublicApi('/public/categories', host);
  if (!response.ok) {
    throw failedResponse(response.status);
  }

  return (await response.json()) as PublicCategoryDto[];
}
