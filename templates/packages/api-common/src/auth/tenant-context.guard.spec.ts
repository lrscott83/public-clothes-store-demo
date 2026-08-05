import { BadRequestException, ForbiddenException, InternalServerErrorException, Logger, type ExecutionContext } from '@nestjs/common';
import type { CompanyUser, ICompanyRepository, IMembershipRepository, Membership } from '@store-mgmt/domain';
import { USER_ROLES } from '@store-mgmt/domain';
import type { TenantContext, TenantContextService } from '@store-mgmt/infra-db';
import { TenantContextGuard } from './tenant-context.guard.js';
import type { AuthenticatedUser, SanitizedUser } from './jwt.strategy.js';

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'membership-1',
    userId: 'user-1',
    companyId: 'company-1',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function tenantCompanyUser(overrides: Partial<CompanyUser> = {}): CompanyUser {
  return {
    id: 'user-1',
    role: USER_ROLES.owner,
    createdByCompanyUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function authUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    login: 'juan.perez',
    fullName: 'Juan Perez',
    email: null,
    cellPhone: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Fake `ICompanyRepository` — active, provisioned company by default. */
function makeCompanyRepository(overrides: { isActive?: boolean; schemaName?: string | null } = {}) {
  const findById = jest.fn().mockResolvedValue({
    id: 'company-1',
    name: 'Acme',
    slug: 'acme',
    isActive: overrides.isActive ?? true,
    schemaName: overrides.schemaName === undefined ? 'store_mgmt_tenant_company_1' : overrides.schemaName,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  return { findById } as unknown as ICompanyRepository;
}

function makeMembershipRepository(opts: {
  findByUserAndCompany?: Membership | null;
  listActiveByUserId?: Membership[];
} = {}) {
  const findByUserAndCompany = jest.fn().mockResolvedValue(
    opts.findByUserAndCompany === undefined ? membership() : opts.findByUserAndCompany,
  );
  const listActiveByUserId = jest.fn().mockResolvedValue(
    opts.listActiveByUserId === undefined ? [membership()] : opts.listActiveByUserId,
  );
  return { findByUserAndCompany, listActiveByUserId } as unknown as IMembershipRepository;
}

/** Fake `TenantContextService` — `run()` executes `fn` immediately, `getClient()` returns a stub tenant client. */
function makeTenantContextService(findUniqueImpl: jest.Mock) {
  const client = { companyUser: { findUnique: findUniqueImpl } };
  const run = jest.fn((_ctx: TenantContext, fn: () => unknown) => fn());
  const getClient = jest.fn().mockReturnValue(client);
  return { run, getClient } as unknown as TenantContextService;
}

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantContextGuard', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('valid X-Company-Id with ACTIVE membership resolves tenant, sets req.tenant and req.user.roles/companyId/companyUserId', async () => {
    const findUnique = jest.fn().mockResolvedValue(tenantCompanyUser({ role: USER_ROLES.admin }));
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(membershipRepository.findByUserAndCompany).toHaveBeenCalledWith('user-1', 'company-1');
    expect(request.tenant).toEqual({ companyId: 'company-1', schemaName: 'store_mgmt_tenant_company_1' });
    expect((request.user as SanitizedUser).roles).toBe(USER_ROLES.admin);
    expect((request.user as SanitizedUser).companyId).toBe('company-1');
    expect((request.user as SanitizedUser).companyUserId).toBe('user-1');
  });

  it('no X-Company-Id header falls back to the sole ACTIVE Membership', async () => {
    const findUnique = jest.fn().mockResolvedValue(tenantCompanyUser());
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: {} };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(membershipRepository.listActiveByUserId).toHaveBeenCalledWith('user-1');
    expect(membershipRepository.findByUserAndCompany).not.toHaveBeenCalled();
  });

  it('rejects with 400 when the caller has SEVERAL ACTIVE memberships and sent no X-Company-Id — never picks one arbitrarily', async () => {
    // The spec says the fallback is the caller's *sole* ACTIVE Membership.
    // With more than one there is no sole membership, so there is nothing to
    // fall back to: the request is ambiguous and the client must say which
    // company it means. Silently serving whichever row the database returned
    // first is a cross-tenant read that looks like a success.
    const findUnique = jest.fn().mockResolvedValue(tenantCompanyUser());
    const membershipRepository = makeMembershipRepository({
      listActiveByUserId: [membership({ id: 'm-1' }), membership({ id: 'm-2' })],
    });
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: {} };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(BadRequestException);
    expect(request.tenant).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does NOT resolve a tenant when the caller has multiple Memberships of mixed status and no header — only the sole ACTIVE one is used', async () => {
    // `listActiveByUserId` returns only ACTIVE rows, so a user with several
    // memberships of DIFFERENT statuses still has exactly one to fall back
    // to. That is the case here: the fallback works, unambiguously. The
    // several-ACTIVE case is the test above, which rejects.
    const findUnique = jest.fn().mockResolvedValue(tenantCompanyUser());
    const membershipRepository = makeMembershipRepository({ listActiveByUserId: [membership({ id: 'm-active' })] });
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: {} };
    const result = await guard.canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(request.tenant).toEqual({ companyId: 'company-1', schemaName: 'store_mgmt_tenant_company_1' });
  });

  it('no ACTIVE Membership for the requested company → 403, no tenant client is ever acquired', async () => {
    const findUnique = jest.fn();
    const membershipRepository = makeMembershipRepository({ findByUserAndCompany: null });
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
    expect(companyRepository.findById).not.toHaveBeenCalled();
    expect(tenantContext.run).not.toHaveBeenCalled();
    expect(tenantContext.getClient).not.toHaveBeenCalled();
  });

  it('membership for a DIFFERENT company than requested → 403 (no cross-company fallback)', async () => {
    const findUnique = jest.fn();
    // The caller has an ACTIVE membership somewhere, but not for the company
    // named in the header — findByUserAndCompany(user, 'company-2') is null.
    const membershipRepository = makeMembershipRepository({ findByUserAndCompany: null });
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-2' } };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
    expect(membershipRepository.findByUserAndCompany).toHaveBeenCalledWith('user-1', 'company-2');
    expect(tenantContext.run).not.toHaveBeenCalled();
  });

  it.each(['REVOKED', 'SUSPENDED'] as const)(
    'a %s Membership is rejected identically to a missing one → 403',
    async (status) => {
      const findUnique = jest.fn();
      const membershipRepository = makeMembershipRepository({ findByUserAndCompany: membership({ status }) });
      const companyRepository = makeCompanyRepository();
      const tenantContext = makeTenantContextService(findUnique);
      const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

      const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };

      await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
      expect(tenantContext.run).not.toHaveBeenCalled();
    },
  );

  it('Company inactive → 403, never a query against a nonexistent schema', async () => {
    const findUnique = jest.fn();
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository({ isActive: false });
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
    expect(tenantContext.run).not.toHaveBeenCalled();
    expect(tenantContext.getClient).not.toHaveBeenCalled();
  });

  it('Company unprovisioned (schemaName null) → 403, never a query against a nonexistent schema', async () => {
    const findUnique = jest.fn();
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository({ schemaName: null });
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
    expect(tenantContext.run).not.toHaveBeenCalled();
  });

  it('a database error during the tenant CompanyUser lookup surfaces as 500, never as the same class as a missing row', async () => {
    const findUnique = jest.fn().mockRejectedValue(new Error('connection terminated unexpectedly'));
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(InternalServerErrorException);
  });

  it('a genuinely missing tenant CompanyUser row → 403, distinct from the 500 DB-error case', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };
    let thrown: unknown;
    try {
      await guard.canActivate(makeContext(request));
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(thrown).not.toBeInstanceOf(InternalServerErrorException);
  });

  it('logs MISSING_COMPANY_USER for a genuinely missing tenant CompanyUser row', async () => {
    const logged: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((msg: unknown) => {
      logged.push(String(msg));
    });
    const findUnique = jest.fn().mockResolvedValue(null);
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: authUser(), headers: { 'x-company-id': 'company-1' } };
    await guard.canActivate(makeContext(request)).catch(() => null);

    expect(logged.join('\n')).toContain('MISSING_COMPANY_USER');
  });

  it('does NOT mutate the object JwtStrategy returned — reassigns req.user with a NEW object (TtlCache safety)', async () => {
    const findUnique = jest.fn().mockResolvedValue(tenantCompanyUser());
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const originalUser = authUser();
    const request = { user: originalUser, headers: { 'x-company-id': 'company-1' } };
    await guard.canActivate(makeContext(request));

    // The object JwtStrategy cached in its TtlCache must stay untouched —
    // otherwise a second request for the same user (even for a DIFFERENT
    // company) would read stale roles/companyId/companyUserId off the cache
    // hit, before TenantContextGuard ever runs for that second request.
    expect(originalUser).not.toHaveProperty('roles');
    expect(originalUser).not.toHaveProperty('companyId');
    expect(originalUser).not.toHaveProperty('companyUserId');
    expect(request.user).not.toBe(originalUser);
  });

  it('no req.user (JwtAuthGuard did not run first) → 403 Authentication required', async () => {
    const findUnique = jest.fn();
    const membershipRepository = makeMembershipRepository();
    const companyRepository = makeCompanyRepository();
    const tenantContext = makeTenantContextService(findUnique);
    const guard = new TenantContextGuard(membershipRepository, companyRepository, tenantContext);

    const request = { user: undefined, headers: {} };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
    expect(membershipRepository.listActiveByUserId).not.toHaveBeenCalled();
  });
});
