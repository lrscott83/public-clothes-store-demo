import { makeAuthenticatedRequest } from '../../shared/lib/api.server';
import type { AdminCategoryDto } from './admin-api.types';

/**
 * Thin admin client to `api-salesops`'s category endpoints. Only `list` is
 * needed by task 6.5 (the product form's category dropdown); create/update/
 * soft-delete land in task 6.6, same file.
 */
export async function listCategories(request: Request, companyId: string): Promise<AdminCategoryDto[]> {
  const response = await makeAuthenticatedRequest(request, companyId, '/categories');
  if (!response.ok) {
    throw response;
  }
  return response.json() as Promise<AdminCategoryDto[]>;
}
