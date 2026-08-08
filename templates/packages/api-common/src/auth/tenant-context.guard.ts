import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  COMPANY_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  resolveTenantAccess,
  type CompanyUser,
  type ICompanyRepository,
  type IMembershipRepository,
  type Membership,
} from '@store-mgmt/domain';
import {
  TenantContextService,
  TenantSchemaBehindError,
  TenantSchemaCurrencyService,
  type TenantContext,
} from '@store-mgmt/infra-db';
import type { AuthenticatedUser, SanitizedUser } from './jwt.strategy.js';

const COMPANY_ID_HEADER = 'x-company-id';

interface TenantGuardRequest {
  /** `AuthenticatedUser` on the way in (set by `JwtAuthGuard`); reassigned to `SanitizedUser` on success — see below. */
  user?: AuthenticatedUser | SanitizedUser;
  headers: Record<string, string | string[] | undefined>;
  tenant?: TenantContext;
}

/**
 * Resolves the tenant (`Company` + schema) a request is scoped to, and the
 * caller's role assignment within it (design.md D4). MUST run AFTER
 * `JwtAuthGuard` and BEFORE `RolesGuard`
 * (`@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)`) — see the
 * GUARD-ORDER INVARIANT comment on `SanitizedUser` in `jwt.strategy.ts` for
 * why that order is load-bearing, not stylistic.
 *
 * Chain:
 * 1. Resolve `companyId` from the `X-Company-Id` header, or — when absent —
 *    the caller's sole ACTIVE `Membership`.
 * 2. Reject `403` when no ACTIVE `Membership` exists for that pair.
 * 3. Reject `403` when the resolved `Company` is inactive or has no
 *    provisioned schema (`schemaName === null`) — never query a schema that
 *    does not exist.
 * 3b. Reject `503` when that schema is established to be BEHIND this build
 *    (`TenantSchemaCurrencyService`, `TENANT_SCHEMA_DRIFT_CHECK=enforce`).
 *    THIS is where the schema-currency gate lives, and the placement is the
 *    whole point of it. The previous version gated `main.ts`: one tenant
 *    missing an enum label made `process.exit(1)` refuse boot for EVERY
 *    tenant, which is a company-wide outage in answer to one endpoint 500ing
 *    in one tenant. Here the refusal is scoped to the request whose schema is
 *    actually stale, it also covers tenants provisioned at RUNTIME (which a
 *    boot probe never saw), and it is `warn` by default. `503`, not `500`:
 *    the request is well-formed and the fix — running the fleet migration —
 *    is operational and imminent.
 * 4. Inside a tenant context scope, look up the tenant `CompanyUser` row
 *    matching the caller's user id. A DB error during that lookup surfaces
 *    as `500` (infrastructure failure); a genuinely missing row surfaces as
 *    a distinct, logged `403` (`MISSING_COMPANY_USER`) — these are NEVER
 *    reported as the same class of failure (design D4, explicitly rejecting
 *    poolops's `catch → null` pattern that conflates the two).
 * 5. On success, set `req.tenant = { companyId, schemaName }` and populate
 *    `roles` / `companyId` / `companyUserId` on `req.user`.
 *
 * Step 5 reassigns `req.user` to a NEW object rather than mutating the one
 * `JwtStrategy` returned. `JwtStrategy` caches that exact object in its
 * `TtlCache`, keyed by user id — mutating it in place would leak this
 * request's tenant resolution into the NEXT cache hit for the same user,
 * even for a different company. Never mutate `req.user` here.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: IMembershipRepository,
    @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
    private readonly tenantContext: TenantContextService,
    private readonly schemaCurrency: TenantSchemaCurrencyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantGuardRequest>();
    const user = request.user;
    if (!user) {
      // Defensive — `JwtAuthGuard` rejects an unauthenticated request with
      // 401 before this guard ever runs in a correctly-ordered chain. If
      // `req.user` is absent here anyway, fail loud rather than crash on a
      // null dereference below.
      throw new ForbiddenException('Authentication required');
    }

    const requestedCompanyId = this.readCompanyIdHeader(request);
    const membership = requestedCompanyId
      ? await this.membershipRepository.findByUserAndCompany(user.id, requestedCompanyId)
      : await this.resolveSoleActiveMembership(user.id);

    if (!membership || membership.status !== 'ACTIVE') {
      this.logger.error(
        `NO_ACTIVE_MEMBERSHIP: user ${user.id}, requested company ${requestedCompanyId ?? '(sole ACTIVE membership)'}`,
      );
      throw new ForbiddenException('No active membership for this company');
    }

    const company = await this.companyRepository.findById(membership.companyId);
    if (!company || !company.isActive || !company.schemaName) {
      this.logger.error(
        `COMPANY_UNAVAILABLE: company ${membership.companyId} is inactive or has no provisioned schema`,
      );
      throw new ForbiddenException('Company is not available');
    }

    const tenant: TenantContext = { companyId: company.id, schemaName: company.schemaName };
    await this.assertSchemaCurrent(tenant.schemaName);
    const companyUser = await this.tenantContext.run(tenant, () => this.findTenantCompanyUser(user.id));

    const access = resolveTenantAccess({ membership, companyUser });
    if (!access.granted || !companyUser) {
      this.logger.error(
        `MISSING_COMPANY_USER: user ${user.id} has no tenant CompanyUser in company ${company.id}`,
      );
      throw new ForbiddenException('User is not provisioned in this company');
    }

    // Typed explicitly as `SanitizedUser` — a NEW object, never a mutation of
    // `user` (the exact instance `JwtStrategy`'s `TtlCache` holds, see the
    // class doc comment above). TypeScript enforces every required
    // `SanitizedUser` field is set here; nothing downstream can read a
    // partially-resolved tenant identity.
    const resolvedUser: SanitizedUser = {
      ...user,
      roles: companyUser.role,
      companyId: company.id,
      companyUserId: companyUser.id,
    };

    request.tenant = tenant;
    request.user = resolvedUser;

    return true;
  }

  /**
   * Refuses THIS tenant, and only this tenant, when its schema is established
   * to be missing enum labels this build writes.
   *
   * `TenantSchemaCurrencyService` caches per schema (a `current` verdict for
   * the process's lifetime, a `behind` one briefly so a migration heals it
   * without a restart), so this is not a per-request round trip. It never
   * throws for "I could not check" — an unreachable database is not evidence
   * of drift, and at `warn` (the default) it never throws at all.
   */
  private async assertSchemaCurrent(schemaName: string): Promise<void> {
    try {
      await this.schemaCurrency.assertSchemaCurrent(schemaName);
    } catch (err) {
      if (err instanceof TenantSchemaBehindError) {
        this.logger.error(`TENANT_SCHEMA_BEHIND: ${schemaName}\n${err.message}`);
        throw new ServiceUnavailableException(
          `Tenant schema "${schemaName}" is behind this build and cannot serve requests yet`,
        );
      }
      throw err;
    }
  }

  private readCompanyIdHeader(request: TenantGuardRequest): string | undefined {
    const raw = request.headers[COMPANY_ID_HEADER];
    return Array.isArray(raw) ? raw[0] : raw;
  }

  /**
   * The header-less fallback, and it is deliberately narrow: the spec allows
   * it only when the caller has a *sole* ACTIVE membership. Two or more and
   * there is no sole membership to fall back to — the request is ambiguous
   * and the client must name the company. Answering it with whichever row
   * the database happened to return first would serve one company's data
   * under another company's intent, and it would look like a success.
   *
   * Zero is left to the caller's existing NO_ACTIVE_MEMBERSHIP path (403);
   * only the ambiguous case is decided here, and it is a client error (400),
   * not an authorization one — the caller may well be entitled to both.
   */
  private async resolveSoleActiveMembership(userId: string): Promise<Membership | null> {
    const active = await this.membershipRepository.listActiveByUserId(userId);
    if (active.length > 1) {
      this.logger.error(
        `AMBIGUOUS_MEMBERSHIP: user ${userId} has ${active.length} ACTIVE memberships and sent no ${COMPANY_ID_HEADER}`,
      );
      throw new BadRequestException(
        `${COMPANY_ID_HEADER} header is required when the caller belongs to more than one company`,
      );
    }
    return active[0] ?? null;
  }

  /**
   * A DB error here (connection failure, timeout, etc.) is an infrastructure
   * failure and MUST surface as `500` — it is NEVER reported as the same
   * class as a genuinely missing row (which `findUnique` reports as `null`,
   * not a rejection).
   */
  private async findTenantCompanyUser(userId: string): Promise<CompanyUser | null> {
    try {
      return await this.tenantContext.getClient().companyUser.findUnique({ where: { id: userId } });
    } catch (err) {
      this.logger.error(
        `TENANT_COMPANY_USER_LOOKUP_FAILED: user ${userId}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to resolve tenant membership');
    }
  }
}
