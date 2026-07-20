import { randomUUID } from 'node:crypto';
import { InvalidCategoryError } from './errors.js';

/**
 * Category master-data entity. FLAT (no `parentId`/hierarchy field) — the 11
 * catalog rubros are reorderable/deactivatable, not nested. `Product.categoryId`
 * is a required FK to this entity's `id`.
 */
export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly image?: string;
  readonly icon?: string;
  readonly order: number;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createCategory`. `id`/`createdAt`/`updatedAt` are optional so the
 * factory can mint a brand-new category (defaults applied). Also the shape
 * `ICategoryRepository.create` accepts.
 */
export interface CreateCategoryInput {
  readonly id?: string;
  readonly name: string;
  readonly slug: string;
  readonly image?: string;
  readonly icon?: string;
  readonly order: number;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `Category`. Enforces a non-empty, non-whitespace
 * `slug` (the unique key). Throws `InvalidCategoryError` — never silently
 * accepts a blank slug.
 */
export function createCategory(input: CreateCategoryInput): Category {
  if (!input.name || input.name.trim().length === 0) {
    throw new InvalidCategoryError('Category name must not be empty');
  }
  if (!input.slug || input.slug.trim().length === 0) {
    throw new InvalidCategoryError('Category slug must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    slug: input.slug,
    image: input.image,
    icon: input.icon,
    order: input.order,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
