import type { CreateProductInput, Product } from './product.js';

/** Optional filter for `IProductRepository.list`. */
export interface ProductListFilter {
  readonly categoryId?: string;
  /** When omitted or `false`, `active: false` products are excluded (default listing). */
  readonly includeInactive?: boolean;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type ProductUpdateInput = Partial<Omit<Product, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing products. Zero dependency on any persistence
 * technology — domain and application code import this interface, never a
 * concrete Prisma class. `softDelete` flips `active`, never a hard DELETE
 * (Sales order-history FK would orphan otherwise).
 */
export interface IProductRepository {
  create(input: CreateProductInput): Promise<Product>;
  update(id: string, patch: ProductUpdateInput): Promise<Product>;
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Product | null>;
  list(filter?: ProductListFilter): Promise<Product[]>;
}

/** DI token for `IProductRepository` — consumers inject by this symbol. */
export const PRODUCT_REPOSITORY = Symbol('IProductRepository');
