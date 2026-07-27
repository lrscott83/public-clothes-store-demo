import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type UserRoleValue } from '@store-mgmt/domain';
import { ROLES_KEY } from './roles.decorator.js';
import type { SanitizedUser } from './jwt.strategy.js';

/**
 * Enforces `@Roles(...)` metadata against `req.user.roles` — the COMPANY-SCOPED
 * bitmask that `JwtStrategy` reads off the user's `CompanyUser` assignment and
 * attaches to `req.user`. Must run AFTER `JwtAuthGuard` in the guard chain
 * (`@UseGuards(JwtAuthGuard, RolesGuard)`) — an unauthenticated request is
 * rejected with 401 by `JwtAuthGuard` before this guard ever runs.
 *
 * GUARD-ORDER INVARIANT (design §0.1): the bitmask MUST reach this guard as a
 * property of `req.user`, never as a sibling field on `req`, and no third
 * guard may populate it. That is what makes a wrong guard order fail loudly
 * here (`req.user` absent → explicit 403) instead of silently — an `undefined`
 * bitmask would make `can()` evaluate to `0` and lock every user out with no
 * explanation. Regression test: `roles.guard.spec.ts`, "guard-order invariant".
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

    const requiredMask = requiredRoles.reduce((mask, bit) => mask | bit, 0);
    if (!can(user.roles, requiredMask)) {
      throw new ForbiddenException('Insufficient role to perform this action');
    }

    return true;
  }
}
