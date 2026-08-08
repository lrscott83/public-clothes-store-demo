import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { USER_ROLES } from '@store-mgmt/domain';
import { Roles, ROLES_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

function makeContext(user: { roles?: number } | undefined): ExecutionContext {
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

  // GUARD-ORDER INVARIANT REGRESSION (design D4, rewritten Phase 7) — two
  // DISTINCT failure modes now both fail loudly, for two DISTINCT wrong
  // orderings of the three-guard chain (`JwtAuthGuard → TenantContextGuard →
  // RolesGuard`). Neither is a "defensive" nice-to-have; both are load-bearing.

  // Case 1 (unchanged from the old invariant): `RolesGuard` before
  // `JwtAuthGuard` — `req.user` is absent entirely.
  it('no req.user when a role IS required → ForbiddenException (guard-order invariant, case 1: RolesGuard before JwtAuthGuard)', () => {
    const guard = makeGuard([USER_ROLES.owner]);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  // Case 2 (NEW, replaces the old "no third guard may be introduced" rule):
  // `RolesGuard` before `TenantContextGuard`, or `TenantContextGuard` omitted
  // from the chain entirely — `req.user` exists (JwtAuthGuard ran) but
  // `req.user.roles` is `undefined` because the guard that populates it never
  // ran. Because the bitmask lives on `req.user` (never a sibling `req`
  // field) and this explicit `undefined` check exists, `can(undefined, mask)`
  // is NEVER reached — it would otherwise silently evaluate to `0`, and every
  // request would 403 with nothing explaining why. Do not weaken this.
  it("req.user present but roles is undefined (TenantContextGuard never ran) → ForbiddenException('Tenant context not resolved') (guard-order invariant, case 2)", () => {
    const guard = makeGuard([USER_ROLES.owner]);

    expect(() => guard.canActivate(makeContext({ roles: undefined }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext({ roles: undefined }))).toThrow('Tenant context not resolved');
  });

  it('ROLES_KEY is the metadata key the @Roles decorator sets', () => {
    expect(ROLES_KEY).toBe('roles');
    expect(typeof Roles).toBe('function');
  });
});
