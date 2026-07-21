import { randomUUID } from 'node:crypto';
import { InvalidCustomerError } from './errors.js';

/**
 * Customer master-data entity. FLAT (single `fullName`, no address
 * hierarchy) — mirrors `Warehouse`. Only `fullName` is required; every
 * contact field is optional. Stores NO money field (`creditLimit`/`balance`/
 * `debt`) — a customer's debt is derived from `SaleCredit` in a future
 * change, never stored here.
 */
export interface Customer {
  readonly id: string;
  readonly fullName: string;
  readonly documentId: string | null;
  readonly cellPhone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly note: string | null;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createCustomer`. `id`/`createdAt`/`updatedAt` are optional so the
 * factory can mint a brand-new customer (defaults applied). Also the shape
 * `ICustomerRepository.create` accepts.
 */
export interface CreateCustomerInput {
  readonly id?: string;
  readonly fullName: string;
  readonly documentId?: string | null;
  readonly cellPhone?: string | null;
  readonly email?: string | null;
  readonly address?: string | null;
  readonly note?: string | null;
  readonly active?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `Customer`. Enforces a non-empty,
 * non-whitespace `fullName`. Throws `InvalidCustomerError` — never silently
 * accepts a blank name. Every absent contact field defaults to `null`; no
 * "at least one contact" invariant is enforced (a walk-in cash customer with
 * only a name is valid master data).
 */
export function createCustomer(input: CreateCustomerInput): Customer {
  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new InvalidCustomerError('Customer fullName must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    fullName: input.fullName,
    documentId: input.documentId ?? null,
    cellPhone: input.cellPhone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    note: input.note ?? null,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
