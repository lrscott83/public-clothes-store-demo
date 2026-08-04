import { randomUUID } from 'node:crypto';
import type { UserRoleValue } from '../users/roles.js';
import { InvalidCompanyUserError, InvalidMembershipError } from './errors.js';

/**
 * Lifecycle status of a `Membership` — the master-side "is this person
 * active in this company" record. Non-`ACTIVE` denies access identically to
 * a missing row (design D1/D4; spec: salesops-companies "Membership Status
 * Gates Company Access"). Renamed from the old `CompanyUserStatus` — status
 * now lives in exactly one place, the master `Membership`, never on the
 * tenant `CompanyUser`.
 */
export type MembershipStatus = 'ACTIVE' | 'REVOKED' | 'SUSPENDED';

/**
 * `Membership` — master-schema `(userId, companyId, status)` record and the
 * SINGLE source of "is this person active in this company" (design D1).
 * Access to a company's tenant schema requires an ACTIVE `Membership` for
 * that `(userId, companyId)` pair — there is no implicit default company
 * (spec: "Master Membership Gates Company Access"). Created by the
 * provisioning saga (design D7 step 4) and, later, invite-accept flows
 * (out of scope for this change).
 */
export interface Membership {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createMembership`. `id`/`createdAt`/`updatedAt` are optional so
 * the factory can mint a brand-new membership (defaults applied).
 */
export interface CreateMembershipInput {
  readonly id?: string;
  readonly userId: string;
  readonly companyId: string;
  readonly status?: MembershipStatus;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `Membership`. Enforces non-empty,
 * non-whitespace `userId`/`companyId`. `status` defaults to `ACTIVE` — the
 * shape the provisioning saga creates. Throws `InvalidMembershipError` —
 * never silently accepts invalid input. Uniqueness of `(userId, companyId)`
 * is enforced by the DB unique index and surfaces at the repository layer.
 */
export function createMembership(input: CreateMembershipInput): Membership {
  if (!input.userId || input.userId.trim().length === 0) {
    throw new InvalidMembershipError('Membership userId must not be empty or whitespace-only');
  }
  if (!input.companyId || input.companyId.trim().length === 0) {
    throw new InvalidMembershipError('Membership companyId must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    companyId: input.companyId,
    status: input.status ?? 'ACTIVE',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/**
 * `CompanyUser` — tenant-schema role assignment, reshaped per design D1.
 * `id` IS the master `User.id`, the SOLE PK — provided explicitly, never
 * auto-generated, because which company a row belongs to is expressed by
 * which tenant schema it lives in, not by a `companyId` column (spec:
 * "CompanyUser Collapsed-PK Shape (Tenant-Side)"). Carries NO `userId`, NO
 * `companyId`, and NO independent status field — active/inactive lives in
 * exactly one place, the master `Membership.status` (spec: "Membership
 * Status Gates Company Access" — "CompanyUser carries no independent
 * status field").
 */
export interface CompanyUser {
  readonly id: string;
  readonly role: UserRoleValue;
  /**
   * `CompanyUser.id` of whoever provisioned this assignment. `null` for
   * self-registered, seeded, and saga-owner rows — never backfilled,
   * because an invented creator is invented audit.
   */
  readonly createdByCompanyUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createCompanyUser`. `id` is REQUIRED — it is the master
 * `User.id` the caller already resolved, never minted here.
 * `createdAt`/`updatedAt` stay optional so the factory can mint a
 * brand-new assignment with defaults applied.
 */
export interface CreateCompanyUserInput {
  readonly id: string;
  readonly role: UserRoleValue;
  /** Omitted (or `null`) whenever nobody provisioned this assignment — signup, seed, saga owner. */
  readonly createdByCompanyUserId?: string | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a tenant-side `CompanyUser`. Enforces a
 * non-empty, non-whitespace `id` (zero is not a valid id — this is the
 * master `User.id`, provided explicitly, never generated) and a
 * non-negative integer `role` (zero is a VALID zero-permission state —
 * every `hasRole` false, every `@Roles()` 403 — explicitly NOT an error).
 * Throws `InvalidCompanyUserError` — never silently accepts invalid input.
 */
export function createCompanyUser(input: CreateCompanyUserInput): CompanyUser {
  if (!input.id || input.id.trim().length === 0) {
    throw new InvalidCompanyUserError(
      'CompanyUser id must not be empty or whitespace-only — it is the master User.id, provided explicitly',
    );
  }
  if (!Number.isInteger(input.role) || input.role < 0) {
    throw new InvalidCompanyUserError('CompanyUser role must be a non-negative integer bitmask');
  }

  const now = new Date();
  return {
    id: input.id,
    role: input.role,
    createdByCompanyUserId: input.createdByCompanyUserId ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
