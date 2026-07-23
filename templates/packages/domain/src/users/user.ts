import { randomUUID } from 'node:crypto';
import { InvalidUserError } from './errors.js';
import { USER_ROLES, type UserRoleValue } from './roles.js';

/** Bcrypt hash shape (`$2a$`/`$2b$`/`$2y$` prefix) — the "never store plaintext" guarantee at the domain boundary. */
const BCRYPT_HASH_SHAPE = /^\$2[aby]\$/;

/**
 * User identity + credentials entity. `login` (NOT `email`) is the unique,
 * required authentication identifier. `email`/`cellPhone` are OPTIONAL.
 * `passwordHash` is required and must be bcrypt-shaped — plaintext passwords
 * never reach this entity. `roles` is an Int bitmask (see `roles.ts`). No
 * `isEmailVerified` field exists (owner-locked non-goal).
 */
export interface User {
  readonly id: string;
  readonly login: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly cellPhone: string | null;
  readonly isActive: boolean;
  readonly roles: UserRoleValue;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createUser`. `id`/`createdAt`/`updatedAt` are optional so the
 * factory can mint a brand-new user (defaults applied). Also the shape
 * `IUserRepository.create` accepts.
 */
export interface CreateUserInput {
  readonly id?: string;
  readonly login: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly email?: string | null;
  readonly cellPhone?: string | null;
  readonly isActive?: boolean;
  readonly roles?: UserRoleValue;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Validates and constructs a `User`. Enforces non-empty/non-whitespace
 * `login` and `fullName`, and a required, bcrypt-shaped `passwordHash`.
 * Throws `InvalidUserError` — never silently accepts invalid input.
 * Uniqueness of `login` is enforced by the DB unique index and surfaces as
 * `DuplicateLoginError` at the repository layer.
 */
export function createUser(input: CreateUserInput): User {
  if (!input.login || input.login.trim().length === 0) {
    throw new InvalidUserError('User login must not be empty or whitespace-only');
  }
  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new InvalidUserError('User fullName must not be empty or whitespace-only');
  }
  if (!input.passwordHash || input.passwordHash.trim().length === 0) {
    throw new InvalidUserError('User passwordHash is required');
  }
  if (!BCRYPT_HASH_SHAPE.test(input.passwordHash)) {
    throw new InvalidUserError('User passwordHash must be a bcrypt hash — plaintext passwords are never accepted');
  }

  const now = new Date();
  return {
    id: input.id ?? randomUUID(),
    login: input.login,
    passwordHash: input.passwordHash,
    fullName: input.fullName,
    email: input.email ?? null,
    cellPhone: input.cellPhone ?? null,
    isActive: input.isActive ?? true,
    roles: input.roles ?? USER_ROLES.user,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
