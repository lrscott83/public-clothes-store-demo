import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { JwtAuthGuard, type SanitizedUser } from '@store-mgmt/api-common';

/** `req.user` shape after a REAL `JwtStrategy.validate` — reused verbatim for every controller unit spec. */
export const SAMPLE_AUTH_USER: Omit<SanitizedUser, 'roles'> = {
  id: 'test-user-1',
  login: 'test.user',
  fullName: 'Test User',
  email: null,
  cellPhone: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * Overrides `JwtAuthGuard` on `builder` to inject `req.user` with `roles` —
 * or reject with 401 when `roles` is `null`, simulating the real
 * `JwtAuthGuard` rejecting an unauthenticated request. `RolesGuard` is left
 * UN-mocked (must be added to the module's `providers`) so every spec
 * exercises the REAL role-union/admin-super-root logic, not a bypass.
 * Mirrors `apps/api-idp/src/users/users.controller.spec.ts`'s helper.
 */
export function overrideJwtAuth(
  builder: TestingModuleBuilder,
  roles: number | null,
): TestingModuleBuilder {
  return builder.overrideGuard(JwtAuthGuard).useValue({
    canActivate: (context: ExecutionContext) => {
      if (roles === null) {
        throw new UnauthorizedException();
      }
      const req = context.switchToHttp().getRequest();
      req.user = { ...SAMPLE_AUTH_USER, roles };
      return true;
    },
  });
}
