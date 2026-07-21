import type { CreateCustomerInput, Customer } from './customer.js';

/** Optional filter for `ICustomerRepository.list`. */
export interface CustomerListFilter {
  /** When omitted or `false`, `active: false` customers are excluded (default listing). */
  readonly includeInactive?: boolean;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type CustomerUpdateInput = Partial<Omit<Customer, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing customers. Zero dependency on any persistence
 * technology — domain and application code import this interface, never a
 * concrete Prisma class. `softDelete` flips `active`, never a hard DELETE
 * (a future Ventas `SaleCredit`/`Order` FK would orphan history, exactly
 * like `Warehouse`/`Product`).
 */
export interface ICustomerRepository {
  create(input: CreateCustomerInput): Promise<Customer>;
  update(id: string, patch: CustomerUpdateInput): Promise<Customer>;
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Customer | null>;
  list(filter?: CustomerListFilter): Promise<Customer[]>;
}

/** DI token for `ICustomerRepository` — consumers inject by this symbol. */
export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');
