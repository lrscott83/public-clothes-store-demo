import { SetMetadata } from '@nestjs/common';
import type { UserRoleValue } from '@store-mgmt/domain';

/** Metadata key `RolesGuard` reads via `Reflector`. */
export const ROLES_KEY = 'roles';

/**
 * Marks a route/controller as requiring ANY of the given role bits (union
 * semantics — `RolesGuard` OKs the request if the caller's `effectiveRoles`
 * holds at least one of them). Omitting `@Roles(...)` entirely leaves the
 * route open to any authenticated user (no restriction).
 */
export const Roles = (...roles: UserRoleValue[]) => SetMetadata(ROLES_KEY, roles);
