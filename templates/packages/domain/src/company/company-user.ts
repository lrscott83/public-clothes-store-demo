import { randomUUID } from 'node:crypto';
import type { UserRoleValue } from '../users/roles.js';
import { InvalidCompanyUserError } from './errors.js';

/** Lifecycle status of a `CompanyUser` role assignment. Non-`ACTIVE` denies access identically to a missing row. */
export type CompanyUserStatus = 'ACTIVE' | 'REVOKED' | 'SUSPENDED';

/**
 * `CompanyUser` — a `(userId, companyId)` role assignment. `role` is the SAME
 * Int bitmask that used to live on `User.roles` (see `users/roles.ts`); only
 * its storage location moves, `can()`/`RoleHelpers` semantics are untouched.
 *
 * `userId` is a SOFT FK to `app_user.id` — deliberately NOT a domain
 * reference to `User` (D1): this is the row the deferred schema-per-tenant
 * change moves tenant-side, where a relation to the master `User` cannot be
 * expressed. Integrity is an APPLICATION invariant (write/read/delete
 * discipline documented on the Prisma model), not a type-level one.
 */
export interface CompanyUser {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly role: UserRoleValue;
  readonly status: CompanyUserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createCompanyUser`. `id`/`createdAt`/`updatedAt` are optional so
 * the factory can mint a brand-new assignment (defaults applied). Also the
 * shape `ICompanyUserRepository.create` accepts.
 */
export interface CreateCompanyUserInput {
  readonly id?: string;
  readonly userId: string;
  readonly companyId: string;
  readonly role: UserRoleValue;
  readonly status?: CompanyUserStatus;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `CompanyUser`. Enforces non-empty,
 * non-whitespace `userId`/`companyId` and a non-negative integer `role`
 * (zero is a VALID zero-permission state — every `hasRole` false, every
 * `@Roles()` 403 — explicitly NOT a `MissingCompanyUserError`). `status`
 * defaults to `ACTIVE`. Throws `InvalidCompanyUserError` — never silently
 * accepts invalid input. Uniqueness of `(userId, companyId)` is enforced by
 * the DB unique index and surfaces at the repository layer.
 */
export function createCompanyUser(input: CreateCompanyUserInput): CompanyUser {
  if (!input.userId || input.userId.trim().length === 0) {
    throw new InvalidCompanyUserError('CompanyUser userId must not be empty or whitespace-only');
  }
  if (!input.companyId || input.companyId.trim().length === 0) {
    throw new InvalidCompanyUserError('CompanyUser companyId must not be empty or whitespace-only');
  }
  if (!Number.isInteger(input.role) || input.role < 0) {
    throw new InvalidCompanyUserError('CompanyUser role must be a non-negative integer bitmask');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    status: input.status ?? 'ACTIVE',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
