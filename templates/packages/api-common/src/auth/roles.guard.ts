import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type UserRoleValue } from '@store-mgmt/domain';
import { ROLES_KEY } from './roles.decorator.js';
import type { SanitizedUser } from './jwt.strategy.js';

/**
 * Enforces `@Roles(...)` metadata against `req.user.roles` — the COMPANY-SCOPED
 * bitmask that `TenantContextGuard` reads off the caller's tenant `CompanyUser`
 * and attaches to `req.user`. Must run AFTER `JwtAuthGuard` AND
 * `TenantContextGuard` in the guard chain
 * (`@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)`) — an
 * unauthenticated request is rejected with 401 by `JwtAuthGuard` before this
 * guard ever runs.
 *
 * GUARD-ORDER INVARIANT (design D4, rewritten Phase 7 — see the full account
 * on `SanitizedUser` in `jwt.strategy.ts`): the bitmask MUST reach this guard
 * as a property of `req.user`, never as a sibling field on `req`. Two DISTINCT
 * wrong orderings must both fail loudly, not silently:
 * - `req.user` absent entirely → `RolesGuard` ran before `JwtAuthGuard`.
 * - `req.user` present but `req.user.roles === undefined` → `RolesGuard` ran
 *   before `TenantContextGuard`, or `TenantContextGuard` was left out of the
 *   chain. This explicit check is what replaces the RETIRED "no third guard
 *   may be introduced" rule — this change introduces exactly that third
 *   guard, and its purpose (never evaluate `can(undefined, mask)` as a silent
 *   `0`) is preserved by checking for `undefined` explicitly instead of
 *   forbidding the guard that would produce it.
 * Regression test: `roles.guard.spec.ts`, "guard-order invariant".
 *
 * - No `@Roles()` metadata on the route → allow (no restriction).
 * - `admin` bit held → allow regardless of the required mask (super-root).
 * - Otherwise → UNION semantics: holding any ONE of the required roles is
 *   enough (`RoleHelpers.can`, which also grants `owner` every business role).
 * - Missing role → `ForbiddenException` (403).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleValue[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: SanitizedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Guard-order invariant, case 2 (see the class doc comment above): a
    // `req.user` that exists but never had `roles` populated means
    // `TenantContextGuard` did not run before this guard. This MUST fail
    // loud and distinct from "insufficient role" — `can(undefined, mask)`
    // would otherwise silently evaluate to `0` and every request would 403
    // with nothing in the logs explaining why.
    if (user.roles === undefined) {
      throw new ForbiddenException('Tenant context not resolved');
    }

    const requiredMask = requiredRoles.reduce((mask, bit) => mask | bit, 0);
    if (!can(user.roles, requiredMask)) {
      throw new ForbiddenException('Insufficient role to perform this action');
    }

    return true;
  }
}
