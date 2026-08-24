import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '@store-mgmt/api-common';
import { SuperadminGuard } from './superadmin.guard.js';

/**
 * Unit spec for the platform identity gate (spec: salesops-platform
 * "Superadmin Identity Gate"). The gate reads `req.user.isSuperadmin` after
 * `JwtAuthGuard` ALONE — `RolesGuard` is unusable here by design because it
 * requires tenant context (`roles.guard.ts` fails loud without it).
 */
function makeContext(user: Partial<AuthenticatedUser> | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: user }),
    }),
  } as unknown as ExecutionContext;
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    login: 'root',
    fullName: 'Root',
    email: null,
    cellPhone: null,
    isActive: true,
    isSuperadmin: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SuperadminGuard', () => {
  const guard = new SuperadminGuard();

  // Scenario: "Superadmin passes the gate with no tenant context"
  it('admits isSuperadmin=true with NO Membership / tenant context anywhere', () => {
    // Deliberately NO roles/companyId/companyUserId on req.user — those only
    // exist after TenantContextGuard, which never runs for platform routes.
    const user = makeUser({ isSuperadmin: true }) as AuthenticatedUser & Record<string, unknown>;
    expect(user.roles).toBeUndefined();
    expect(user.companyId).toBeUndefined();
    expect(user.companyUserId).toBeUndefined();

    expect(guard.canActivate(makeContext(user))).toBe(true);
  });

  // Scenario: "Non-superadmin is rejected with 403"
  it('rejects isSuperadmin=false with ForbiddenException', () => {
    expect(() => guard.canActivate(makeContext(makeUser({ isSuperadmin: false })))).toThrow(
      ForbiddenException,
    );
  });

  it('treats a MISSING flag as non-superadmin (fail closed)', () => {
    expect(() => guard.canActivate(makeContext({ id: 'user-2' } as Partial<AuthenticatedUser>))).toThrow(
      ForbiddenException,
    );
  });
});
