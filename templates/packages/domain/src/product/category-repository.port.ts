import type { Category, CreateCategoryInput } from './category.js';

/** Optional filter for `ICategoryRepository.list`. */
export interface CategoryListFilter {
  /** When omitted or `false`, `active: false` categories are excluded (default listing). */
  readonly includeInactive?: boolean;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type CategoryUpdateInput = Partial<Omit<Category, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing categories. Zero dependency on any persistence
 * technology — domain and application code import this interface, never a
 * concrete Prisma class. `softDelete` flips `active`, never a hard DELETE
 * (referencing products must never be orphaned).
 */
export interface ICategoryRepository {
  create(input: CreateCategoryInput): Promise<Category>;
  update(id: string, patch: CategoryUpdateInput): Promise<Category>;
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;
  list(filter?: CategoryListFilter): Promise<Category[]>;
}

/** DI token for `ICategoryRepository` — consumers inject by this symbol. */
export const CATEGORY_REPOSITORY = Symbol('ICategoryRepository');
