import type { ExecutionContext } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { TenantContext } from '@store-mgmt/infra-db';
import { PublicTenantGuard } from '../tenant/public-tenant.guard.js';

/** `req.tenant` shape set by a REAL `PublicTenantGuard` — reused verbatim across every controller unit spec in this app (design D2). */
export const SAMPLE_TENANT: TenantContext = {
  companyId: 'company-uuid-1',
  schemaName: 'store_mgmt_tenant_company_uuid_1',
};

/**
 * Overrides `PublicTenantGuard` on `builder` to set `req.tenant` directly —
 * mirrors `api-salesops`'s `overrideTenantContext`. Controller unit specs
 * exercise the REAL per-handler `runInTenant(...)` wiring (design D5) but
 * never need a live tenant Postgres schema; `PublicTenantGuard`'s OWN
 * contract (the 404 matrix, the byte-identical-response proof) is covered
 * by its dedicated spec, not re-tested here. MUST be paired with
 * `mockTenantContextService()` bound to `TenantContextService` in the
 * module's `providers` — the controller's own `runInTenant` closure is REAL
 * and calls straight through to it.
 */
export function overridePublicTenant(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideGuard(PublicTenantGuard).useValue({
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.tenant = SAMPLE_TENANT;
      return true;
    },
  });
}

/** Minimal `TenantContextService` stand-in: `run(context, fn)` just invokes `fn()` synchronously — see `api-salesops`'s identical helper for the full rationale. */
export function mockTenantContextService(): { run: jest.Mock } {
  return {
    run: jest.fn((_context: TenantContext, fn: () => unknown) => fn()),
  };
}
