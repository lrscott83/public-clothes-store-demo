import { randomUUID } from 'node:crypto';
import { InvalidCustomerError } from './errors.js';

/**
 * Customer master-data entity. FLAT (single `fullName`, no address
 * hierarchy) — mirrors `Warehouse`. Only `fullName` and `userId` are
 * required; every contact field is optional. Stores NO money field
 * (`creditLimit`/`balance`/`debt`) — a customer's debt is derived from
 * `SaleCredit` in a future change, never stored here. Every `Customer`
 * references exactly one `User` via a REQUIRED, UNIQUE `userId` FK (1:1) — a
 * `Customer` cannot exist without a corresponding `User` (login identity,
 * `backend-users-roles`).
 */
export interface Customer {
  readonly id: string;
  readonly userId: string;
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
  readonly userId: string;
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
 * non-whitespace `fullName` AND a non-empty, non-whitespace `userId` — the
 * required, unique link to the customer's `User` identity. Throws
 * `InvalidCustomerError` — never silently accepts a blank name/userId.
 * Whether `userId` actually references an EXISTING `User` (and the 1:1
 * uniqueness of that link) is enforced by the DB FK/unique index and
 * surfaces as `CustomerUserNotFoundError`/`DuplicateCustomerUserError` at the
 * repository layer — pure domain code has no DB access to check existence.
 * Every absent contact field defaults to `null`; no "at least one contact"
 * invariant is enforced (a walk-in cash customer with only a name is valid
 * master data).
 */
export function createCustomer(input: CreateCustomerInput): Customer {
  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new InvalidCustomerError('Customer fullName must not be empty or whitespace-only');
  }
  if (!input.userId || input.userId.trim().length === 0) {
    throw new InvalidCustomerError('Customer userId must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    userId: input.userId,
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
