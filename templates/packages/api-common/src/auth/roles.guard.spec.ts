import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { USER_ROLES } from '@store-mgmt/domain';
import { Roles, ROLES_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

function makeContext(user: { roles: number } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredRoles: number[] | undefined) {
  const getAllAndOverride = jest.fn().mockReturnValue(requiredRoles);
  const reflector = { getAllAndOverride } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('no @Roles() metadata on the route → allow', () => {
    const guard = makeGuard(undefined);

    expect(guard.canActivate(makeContext({ roles: USER_ROLES.user }))).toBe(true);
  });

  it('empty @Roles() metadata → allow', () => {
    const guard = makeGuard([]);

    expect(guard.canActivate(makeContext({ roles: USER_ROLES.user }))).toBe(true);
  });

  it('admin bit → allow regardless of the required mask', () => {
    const guard = makeGuard([USER_ROLES.owner]);

    expect(guard.canActivate(makeContext({ roles: USER_ROLES.admin }))).toBe(true);
  });

  it('union-satisfies: owner passes a business-role (warehouse_operator) check', () => {
    const guard = makeGuard([USER_ROLES.warehouse_operator]);

    expect(guard.canActivate(makeContext({ roles: USER_ROLES.owner }))).toBe(true);
  });

  it('holding the exact required role → allow', () => {
    const guard = makeGuard([USER_ROLES.warehouse_operator]);

    expect(guard.canActivate(makeContext({ roles: USER_ROLES.warehouse_operator }))).toBe(true);
  });

  it('missing the required role → ForbiddenException', () => {
    const guard = makeGuard([USER_ROLES.owner]);

    expect(() => guard.canActivate(makeContext({ roles: USER_ROLES.user }))).toThrow(ForbiddenException);
  });

  it('no req.user when a role IS required → ForbiddenException (defensive; JwtAuthGuard normally 401s first)', () => {
    const guard = makeGuard([USER_ROLES.owner]);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('ROLES_KEY is the metadata key the @Roles decorator sets', () => {
    expect(ROLES_KEY).toBe('roles');
    expect(typeof Roles).toBe('function');
  });
});
