import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type UserRoleValue } from '@store-mgmt/domain';
import { ROLES_KEY } from './roles.decorator.js';
import type { SanitizedUser } from './jwt.strategy.js';

/**
 * Enforces `@Roles(...)` metadata against `req.user.roles` (the bitmask
 * attached by `JwtStrategy`). Must run AFTER `JwtAuthGuard` in the guard
 * chain (`@UseGuards(JwtAuthGuard, RolesGuard)`) — an unauthenticated request
 * is rejected with 401 by `JwtAuthGuard` before this guard ever runs.
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
