import {
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { COMPANY_REPOSITORY, type ICompanyRepository } from '@store-mgmt/domain';
import type { TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { resolveHostSlug } from './host-slug.js';

export type PublicTenantRequest = Request & { tenant: TenantContext };

/**
 * ALWAYS the exact same instance shape (status, message) regardless of which
 * branch below rejected — design D4: an unknown slug and an inactive/
 * unprovisioned company must be indistinguishable from the response alone.
 */
function notFound(): NotFoundException {
  return new NotFoundException('Not Found');
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Anonymous tenant resolution for `api-public` (design.md D2, spec:
 * salesops-tenancy "Anonymous Subdomain Tenant Resolution"). Requires
 * NEITHER a JWT nor a `Membership` row — the opposite of
 * `TenantContextGuard`, not a variant of it, which is why this is a
 * brand-new class rather than a reuse.
 *
 * Deliberately does NOT call `tenantContext.run(...)` — it only sets
 * `req.tenant`. `TenantContextGuard`'s own `AsyncLocalStorage` scope dies
 * the instant `canActivate` resolves, so opening one here would buy nothing;
 * every handler re-opens its own scope via `run-in-tenant.ts`'s
 * `createRunInTenant`, exactly as `api-salesops` does. The only query this
 * guard runs is `ICompanyRepository.findBySlug` against the schema-
 * independent master client (spike 0.2's proof) — it needs no tenant scope
 * of its own to do that.
 */
@Injectable()
export class PublicTenantGuard implements CanActivate {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicTenantRequest>();

    const slug = resolveHostSlug(
      request.headers.host,
      firstHeaderValue(request.headers['x-forwarded-host']),
    );
    if (!slug) {
      throw notFound();
    }

    const company = await this.companyRepository.findBySlug(slug);
    if (!company || !company.isActive || !company.schemaName) {
      throw notFound();
    }

    request.tenant = { companyId: company.id, schemaName: company.schemaName };
    return true;
  }
}
