import { randomUUID } from 'node:crypto';
import { InvalidCustomerError } from './errors.js';

/**
 * Customer master-data entity. FLAT (single `fullName`, no address
 * hierarchy) — mirrors `Warehouse`. Only `fullName` and `companyUserId` are
 * required; every contact field is optional. Stores NO money field
 * (`creditLimit`/`balance`/`debt`) — a customer's debt is derived from
 * `SaleCredit` in a future change, never stored here. Every `Customer`
 * references exactly one tenant `CompanyUser` via a REQUIRED, UNIQUE
 * `companyUserId` FK (1:1) — a `Customer` cannot exist without a
 * corresponding `CompanyUser`.
 *
 * RESHAPED by `multi-tenant-by-schema` (design.md D1, spec salesops-customers
 * "Customer FKs Tenant CompanyUser, Not Master User"): the link used to be
 * `userId → User` (master schema). Prisma forbids a cross-schema `@relation`,
 * so it becomes `companyUserId → CompanyUser` (tenant-side). Since
 * `CompanyUser.id` IS the master `User.id` (D1's collapsed PK), the value a
 * caller passes is unchanged — only the field name and its FK target moved.
 */
export interface Customer {
  readonly id: string;
  readonly companyUserId: string;
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
  readonly companyUserId: string;
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
 * non-whitespace `fullName` AND a non-empty, non-whitespace `companyUserId`
 * — the required, unique link to the customer's tenant `CompanyUser`. Throws
 * `InvalidCustomerError` — never silently accepts a blank name/companyUserId.
 * Whether `companyUserId` actually references an EXISTING `CompanyUser` (and
 * the 1:1 uniqueness of that link) is enforced by the DB FK/unique index and
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
  if (!input.companyUserId || input.companyUserId.trim().length === 0) {
    throw new InvalidCustomerError('Customer companyUserId must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    companyUserId: input.companyUserId,
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
