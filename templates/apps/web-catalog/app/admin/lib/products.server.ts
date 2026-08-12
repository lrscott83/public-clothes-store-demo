import { makeAuthenticatedRequest } from '../../shared/lib/api.server';
import type { AdminProductDto, CreateProductInput, UpdateProductInput } from './admin-api.types';

/**
 * Thin admin client to `api-salesops`'s product CRUD (design.md D7: this
 * app has no authoritative copy of authorization — every call goes through
 * `makeAuthenticatedRequest`, which attaches the Bearer token AND the
 * `X-Company-Id` resolved by `withAuth`). A non-ok response is thrown AS
 * THE RAW `Response` — never parsed into a generic error — so callers
 * (route actions) can inspect the exact status (403 cross-company, 404,
 * ...) and render accordingly, never silently treating it as success.
 */
async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw response;
  }
  return response.json() as Promise<T>;
}

export async function listProducts(request: Request, companyId: string): Promise<AdminProductDto[]> {
  const response = await makeAuthenticatedRequest(request, companyId, '/products?includeInactive=true');
  return parseOrThrow(response);
}

export async function getProduct(request: Request, companyId: string, id: string): Promise<AdminProductDto> {
  const response = await makeAuthenticatedRequest(request, companyId, `/products/${encodeURIComponent(id)}`);
  return parseOrThrow(response);
}

export async function createProduct(
  request: Request,
  companyId: string,
  input: CreateProductInput,
): Promise<AdminProductDto> {
  const response = await makeAuthenticatedRequest(request, companyId, '/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseOrThrow(response);
}

export async function updateProduct(
  request: Request,
  companyId: string,
  id: string,
  input: UpdateProductInput,
): Promise<AdminProductDto> {
  const response = await makeAuthenticatedRequest(request, companyId, `/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseOrThrow(response);
}

export async function softDeleteProduct(request: Request, companyId: string, id: string): Promise<void> {
  const response = await makeAuthenticatedRequest(request, companyId, `/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw response;
  }
}
