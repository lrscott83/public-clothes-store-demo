import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { JwtAuthGuard, TenantContextGuard, type SanitizedUser } from '@store-mgmt/api-common';
import type { TenantContext } from '@store-mgmt/infra-db';

/** `req.user` shape after a REAL `JwtStrategy.validate` — reused verbatim for every controller unit spec. */
export const SAMPLE_AUTH_USER: Omit<SanitizedUser, 'roles'> = {
  id: 'test-user-1',
  login: 'test.user',
  fullName: 'Test User',
  email: null,
  cellPhone: null,
  isActive: true,
  // Present because `JwtStrategy` always resolves a CompanyUser assignment
  // before it will hand back a `req.user` at all — a fixture without it would
  // model a state the real strategy cannot produce.
  companyId: 'test-company-1',
  // The `CompanyUser.id` of that same assignment — the identity sales
  // attribution is stamped from. Deliberately unlike `id` so a spec that
  // confuses the User id with the assignment id fails instead of passing.
  companyUserId: 'test-company-user-1',
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

/** `req.tenant` shape set by a REAL `TenantContextGuard` — reused verbatim for every controller unit spec (Phase 8, design D5). */
export const SAMPLE_TENANT: TenantContext = {
  companyId: SAMPLE_AUTH_USER.companyId,
  schemaName: 'store_mgmt_tenant_test_company_1',
};

/**
 * Overrides `TenantContextGuard` on `builder` to set `req.tenant` directly,
 * mirroring `overrideJwtAuth` above. Controller unit specs exercise the REAL
 * `RolesGuard` and the REAL per-handler `runInTenant(...)` wiring (design
 * D5), but never need a live tenant Postgres schema to prove controller
 * wiring/role enforcement — that is `tenant-context.guard.spec.ts`'s job
 * (Phase 7). MUST be paired with `mockTenantContextService()` bound to
 * `TenantContextService` in the module's `providers` — the controller's own
 * `runInTenant` closure is REAL and calls straight through to it.
 */
export function overrideTenantContext(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideGuard(TenantContextGuard).useValue({
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.tenant = SAMPLE_TENANT;
      return true;
    },
  });
}

/**
 * Minimal `TenantContextService` stand-in: `run(context, fn)` just invokes
 * `fn()` synchronously, no `AsyncLocalStorage`, no real tenant client. Every
 * controller spec provides this via `{ provide: TenantContextService, useValue:
 * mockTenantContextService() }` so the controller's REAL `createRunInTenant`
 * closure has something to call — proving the WIRING (guard sets
 * `req.tenant`, handler calls `runInTenant(req.tenant, ...)`) without
 * standing up a real Postgres schema per unit spec.
 */
export function mockTenantContextService(): { run: jest.Mock } {
  return {
    // Untyped against `TenantContextService['run']`'s generic signature —
    // `jest.fn()` cannot express `<T>(context, fn: () => T) => T` — but this
    // object is only ever handed to Nest DI as a `useValue` for the
    // `TenantContextService` token, never imported by its class type.
    run: jest.fn((_context: TenantContext, fn: () => unknown) => fn()),
  };
}
