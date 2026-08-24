import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@store-mgmt/api-common';

/**
 * Platform identity gate (design D1 — app-local in api-idp; promote to
 * api-common only if a second consumer ever appears). Reads
 * `req.user.isSuperadmin` after `JwtAuthGuard` ALONE:
 *
 *     JwtAuthGuard → SuperadminGuard      (NO TenantContextGuard/RolesGuard)
 *
 * `RolesGuard` is unusable for platform endpoints by design: it requires the
 * tenant context `TenantContextGuard` populates and throws a loud 403
 * ('Tenant context not resolved') without it. A superadmin needs NO
 * Membership anywhere, so this gate is a single boolean check on the
 * master-side flag `JwtStrategy.validate` resolves fresh per request (ADR-2;
 * revocation takes effect within its 30s cache TTL, same as deactivation).
 *
 * An unauthenticated request never reaches this gate — `JwtAuthGuard`
 * rejects it with 401 first.
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.isSuperadmin !== true) {
      throw new ForbiddenException('Platform access requires superadmin');
    }
    return true;
  }
}
