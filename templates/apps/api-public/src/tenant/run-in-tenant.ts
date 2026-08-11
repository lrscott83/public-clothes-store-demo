import type { TenantContext, TenantContextService } from '@store-mgmt/infra-db';

/**
 * design.md D3: a five-line copy of
 * `packages/api-common/src/auth/run-in-tenant.ts`'s `createRunInTenant`, not
 * an import of it. Depending on `@store-mgmt/api-common` would drag
 * `passport`/`@nestjs/passport`/`bcrypt`/the JWT strategy into an app whose
 * defining property is that nobody authenticates — dependency hygiene beats
 * DRY at this size. Same discipline as its twin: `PublicTenantGuard`'s own
 * `AsyncLocalStorage` scope (there isn't one — see design D2) does not
 * survive into the handler, so every handler that touches tenant data
 * re-opens its own scope from `req.tenant` via this helper.
 */
export function createRunInTenant(tenantContext: TenantContextService) {
  return function runInTenant<T>(context: TenantContext, fn: () => T): T {
    return tenantContext.run(context, fn);
  };
}
