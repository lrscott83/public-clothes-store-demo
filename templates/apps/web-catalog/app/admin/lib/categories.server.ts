import { makeAuthenticatedRequest } from '../../shared/lib/api.server';
import type { AdminCategoryDto, CreateCategoryInput, UpdateCategoryInput } from './admin-api.types';

/**
 * Thin admin client to `api-salesops`'s category CRUD — same shape as
 * `products.server.ts` (design D7: this app has no authoritative copy of
 * authorization, every call goes through `makeAuthenticatedRequest`, which
 * attaches the Bearer token AND the `X-Company-Id` resolved by `withAuth`).
 * A non-ok response is thrown AS THE RAW `Response` — never parsed into a
 * generic error — so callers (route actions) can inspect the exact status
 * (403 cross-company, 404, ...) and render accordingly, never silently
 * treating it as success.
 */
async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw response;
  }
  return response.json() as Promise<T>;
}

export async function listCategories(request: Request, companyId: string): Promise<AdminCategoryDto[]> {
  const response = await makeAuthenticatedRequest(request, companyId, '/categories');
  return parseOrThrow(response);
}

export async function getCategory(request: Request, companyId: string, id: string): Promise<AdminCategoryDto> {
  const response = await makeAuthenticatedRequest(request, companyId, `/categories/${encodeURIComponent(id)}`);
  return parseOrThrow(response);
}

export async function createCategory(
  request: Request,
  companyId: string,
  input: CreateCategoryInput,
): Promise<AdminCategoryDto> {
  const response = await makeAuthenticatedRequest(request, companyId, '/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseOrThrow(response);
}

export async function updateCategory(
  request: Request,
  companyId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<AdminCategoryDto> {
  const response = await makeAuthenticatedRequest(request, companyId, `/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseOrThrow(response);
}

export async function softDeleteCategory(request: Request, companyId: string, id: string): Promise<void> {
  const response = await makeAuthenticatedRequest(request, companyId, `/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw response;
  }
}
