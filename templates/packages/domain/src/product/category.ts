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
  readonly image: string | null;
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
  readonly image?: string | null;
  readonly icon?: string;
  readonly order: number;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Atomic invariant: `name` must not be empty or whitespace-only. Exported so
 * the API's partial-update path can validate just this field without
 * reconstructing a whole `Category`. Throws `InvalidCategoryError`.
 */
export function assertValidCategoryName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new InvalidCategoryError('Category name must not be empty');
  }
}

/**
 * Atomic invariant: `slug` (the unique key) must not be empty or
 * whitespace-only. Exported for the same partial-update reason as
 * `assertValidCategoryName`. Throws `InvalidCategoryError`.
 */
export function assertValidCategorySlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new InvalidCategoryError('Category slug must not be empty or whitespace-only');
  }
}

/**
 * Validates and constructs a `Category`. Enforces a non-empty, non-whitespace
 * `name` and `slug` (the unique key) via the atomic field guards. Throws
 * `InvalidCategoryError` — never silently accepts a blank name/slug.
 */
export function createCategory(input: CreateCategoryInput): Category {
  assertValidCategoryName(input.name);
  assertValidCategorySlug(input.slug);

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    slug: input.slug,
    image: input.image ?? null,
    icon: input.icon,
    order: input.order,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
