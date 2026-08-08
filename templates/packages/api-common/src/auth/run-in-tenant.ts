import type { TenantContext, TenantContextService } from '@store-mgmt/infra-db';

/**
 * D5's per-call re-scoping discipline, given a name at the call site.
 *
 * `TenantContextGuard`'s own `AsyncLocalStorage` scope ends the instant its
 * `canActivate` resolves — it does NOT survive into the handler (design.md
 * D5; poolops's own comment claiming otherwise is wrong, which is why 100+
 * downstream call sites there had to re-open it ad hoc from a request
 * field). Every handler that touches tenant data must therefore open its
 * OWN scope from `req.tenant` before calling into a service that resolves a
 * tenant Prisma client — this helper is that one call, given a name so the
 * discipline is visible at every call site instead of re-implemented.
 *
 * Bind it once per controller, at construction:
 *
 * ```ts
 * constructor(private readonly tenantContext: TenantContextService) {}
 * private readonly runInTenant = createRunInTenant(this.tenantContext);
 *
 * @Get()
 * list(@Req() req: Request & { tenant: TenantContext }) {
 *   return this.runInTenant(req.tenant, () => this.service.list());
 * }
 * ```
 *
 * Deliberately NOT an interceptor — an interceptor would bet on the ALS
 * scope surviving NestJS's RxJS pipeline across the handler boundary, which
 * is the exact assumption D5 rejects. Re-scoping per call is idempotent and
 * cheap, and forgetting it fails loudly (`TenantContextNotActiveError`,
 * design D2) instead of silently reading the wrong tenant.
 */
export function createRunInTenant(tenantContext: TenantContextService) {
  return function runInTenant<T>(context: TenantContext, fn: () => T): T {
    return tenantContext.run(context, fn);
  };
}
