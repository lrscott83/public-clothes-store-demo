import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { CUSTOMER_REPOSITORY, DuplicateLoginError, MEMBERSHIP_REPOSITORY, USER_REPOSITORY, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import { CustomerIdentityService } from './customer-identity.service.js';

type RepoMock = Record<string, jest.Mock>;

const ACTOR = { companyUserId: 'company-user-caller', companyId: 'company-1' };

const VALID_BODY = {
  fullName: 'Ana Torres',
  login: 'ana.torres',
  password: 'sup3rsecret',
};

const CREATED_USER = { id: 'user-minted-1', login: 'ana.torres', fullName: 'Ana Torres' };

const CREATED_CUSTOMER = {
  id: 'customer-1',
  userId: 'user-minted-1',
  fullName: 'Ana Torres',
  documentId: null,
  cellPhone: null,
  email: null,
  address: null,
  note: null,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('CustomerIdentityService', () => {
  let service: CustomerIdentityService;
  let userRepository: RepoMock;
  let companyUserCreate: jest.Mock;
  let membershipRepository: RepoMock;
  let customerRepository: RepoMock;

  beforeEach(async () => {
    userRepository = { create: jest.fn().mockResolvedValue(CREATED_USER) };
    companyUserCreate = jest.fn().mockResolvedValue({ id: 'user-minted-1' });
    customerRepository = { create: jest.fn().mockResolvedValue(CREATED_CUSTOMER) };
    membershipRepository = { create: jest.fn().mockResolvedValue({ id: 'membership-1' }) };
    // `TenantContextService` stand-in: only `getClient()` is exercised here —
    // the ACTIVE scope itself is the controller's job (`runInTenant`, design
    // D5), not this service's, so `.run()` is never called from inside it.
    const tenantContext = {
      getClient: jest.fn().mockReturnValue({ companyUser: { create: companyUserCreate } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerIdentityService,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: CUSTOMER_REPOSITORY, useValue: customerRepository },
        { provide: MEMBERSHIP_REPOSITORY, useValue: membershipRepository },
        { provide: TenantContextService, useValue: tenantContext },
      ],
    }).compile();

    service = module.get(CustomerIdentityService);
  });

  // R20 — an identity without a CompanyUser row cannot resolve tenant access
  // (`resolveTenantAccess`/`TenantContextGuard`, design D1/D4). Minting the
  // User without it would leave an account with no role assignment at all in
  // the tenant it was created in.
  describe('R20 — the minted identity gets a tenant CompanyUser row', () => {
    it("writes the tenant CompanyUser through the caller's active tenant scope", async () => {
      await service.createWithIdentity(ACTOR, VALID_BODY);

      expect(companyUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: CREATED_USER.id, role: USER_ROLES.user }),
      });
    });

    it('never writes a companyId or userId column — company identity is the active schema, not a field (Collapsed-PK Shape)', async () => {
      await service.createWithIdentity(ACTOR, VALID_BODY);

      const [{ data }] = companyUserCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(data).not.toHaveProperty('companyId');
      expect(data).not.toHaveProperty('userId');
      expect(data).not.toHaveProperty('status');
    });

    it('hashes the password instead of storing it, and never echoes it back', async () => {
      const result = await service.createWithIdentity(ACTOR, VALID_BODY);

      const [input] = userRepository.create.mock.calls[0] as [{ passwordHash: string }];
      expect(input.passwordHash).not.toBe(VALID_BODY.password);
      expect(input.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(JSON.stringify(result)).not.toContain(VALID_BODY.password);
    });
  });

  // R22 — A15. `api-salesops` installs NO `ValidationPipe` (design §0.13), so
  // the DTO is erased at runtime and cannot be the guard. The guarantee has to
  // be that no expression in this file can read a role from the request at
  // all — a property about the SOURCE, which is why this assertion reads it.
  describe('R22 — the role is a module-private constant, not an input', () => {
    const source = readFileSync(join(__dirname, 'customer-identity.service.ts'), 'utf8');

    it('always writes the `user` bit, whatever the request said', async () => {
      await service.createWithIdentity(ACTOR, {
        ...VALID_BODY,
        // Every shape a caller could plausibly try to smuggle a privilege in.
        roles: USER_ROLES.sales_operator,
        role: USER_ROLES.admin,
        userId: 'the-owners-user-id',
      } as never);

      expect(companyUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: USER_ROLES.user }),
      });
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ id: 'the-owners-user-id' }),
      );
    });

    it('declares the role constant module-private — not exported, not a parameter', () => {
      expect(source).toMatch(/^const CUSTOMER_IDENTITY_ROLE/m);
      expect(source).not.toMatch(/export const CUSTOMER_IDENTITY_ROLE/);
      expect(source).not.toMatch(/CUSTOMER_IDENTITY_ROLE\s*[:=]\s*[^;]*\bdto\b/);
    });

    it('contains no expression that reads a role from the request', () => {
      // `dto` is the only request-derived value in scope; if none of these
      // appear, no role can originate from the body regardless of what a
      // future caller sends.
      expect(source).not.toMatch(/dto\s*\.\s*roles?\b/);
      expect(source).not.toMatch(/dto\s*\.\s*userId\b/);
      expect(source).not.toMatch(/\brole\s*:\s*(?!CUSTOMER_IDENTITY_ROLE)[a-zA-Z]/);
    });
  });

  // R23 — D10 #2/#3. The audit trail comes from the AUTHENTICATED actor and
  // only from there. Tenant SCOPE is no longer a field this service reads at
  // all (design D5): it comes from the ACTIVE `runInTenant` scope the
  // controller opened before calling in, proven generically by
  // `run-in-tenant.ts`/`tenant-context.service.spec.ts` (Phase 4/7) for every
  // handler, not re-proven per service. What this service still owns and
  // must keep proving is attribution.
  describe('R23 — attributed to the caller', () => {
    it('creates an ACTIVE master Membership so the minted login can actually authenticate', async () => {
      // The pre-reshape flow wrote `status: 'ACTIVE'` on the CompanyUser row,
      // and that status was what granted access. D1 moved status to the master
      // Membership, so writing only the tenant CompanyUser mints credentials
      // that resolveTenantAccess/TenantContextGuard reject with 403. The
      // Membership here is the literal translation of the status column that
      // was removed, not a new invite-accept capability.
      await service.createWithIdentity(ACTOR, VALID_BODY);

      expect(membershipRepository.create).toHaveBeenCalledWith({
        userId: CREATED_USER.id,
        companyId: ACTOR.companyId,
        status: 'ACTIVE',
      });
    });

    it('scopes the Membership to the ACTOR\'s company, never to request-body data', async () => {
      const otherCompanyActor = { companyUserId: 'company-user-caller', companyId: 'company-9' };

      await service.createWithIdentity(otherCompanyActor, {
        ...VALID_BODY,
        login: 'other.login',
      } as typeof VALID_BODY & { companyId?: string });

      expect(membershipRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-9' }),
      );
    });

    it('attributes the CompanyUser assignment to the calling actor', async () => {
      await service.createWithIdentity(ACTOR, VALID_BODY);

      expect(companyUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ createdByCompanyUserId: ACTOR.companyUserId }),
      });
    });

    it('attributes each mint to ITS OWN caller, not a stale one from a prior call', async () => {
      const otherActor = { companyUserId: 'company-user-other', companyId: 'company-1' };

      await service.createWithIdentity(ACTOR, VALID_BODY);
      await service.createWithIdentity(otherActor, { ...VALID_BODY, login: 'otra.persona' });

      const attributions = companyUserCreate.mock.calls.map(
        ([{ data }]: [{ data: { createdByCompanyUserId: string } }]) => data.createdByCompanyUserId,
      );
      expect(attributions).toEqual([ACTOR.companyUserId, otherActor.companyUserId]);
      expect(companyUserCreate).toHaveBeenCalledTimes(2);
    });
  });

  // R24 — A16. The write order is User -> CompanyUser -> Customer, NOT
  // transactional. It is ordered so that the only reachable partial states are
  // loud and harmless.
  describe('R24 — partial-failure ordering', () => {
    it('writes nothing when the login collides on write #1', async () => {
      userRepository.create.mockRejectedValue(new DuplicateLoginError('login "ana.torres" is taken'));

      await expect(service.createWithIdentity(ACTOR, VALID_BODY)).rejects.toBeInstanceOf(
        DuplicateLoginError,
      );
      expect(companyUserCreate).not.toHaveBeenCalled();
      expect(customerRepository.create).not.toHaveBeenCalled();
    });

    it('leaves a User with no tenant CompanyUser row — never a silently permissionless account — when write #2 fails', async () => {
      companyUserCreate.mockRejectedValue(new Error('connection reset'));

      await expect(service.createWithIdentity(ACTOR, VALID_BODY)).rejects.toThrow('connection reset');
      // The User exists (write #1 committed) but has no tenant assignment,
      // which is exactly the state `TenantContextGuard` rejects loudly.
      expect(userRepository.create).toHaveBeenCalledTimes(1);
      expect(customerRepository.create).not.toHaveBeenCalled();
    });

    it('writes User -> CompanyUser -> Customer in that order', async () => {
      const order: string[] = [];
      userRepository.create.mockImplementation(async () => {
        order.push('user');
        return CREATED_USER;
      });
      companyUserCreate.mockImplementation(async () => {
        order.push('companyUser');
        return { id: CREATED_USER.id };
      });
      customerRepository.create.mockImplementation(async () => {
        order.push('customer');
        return CREATED_CUSTOMER;
      });

      await service.createWithIdentity(ACTOR, VALID_BODY);

      expect(order).toEqual(['user', 'companyUser', 'customer']);
    });
  });

  it('links the Customer to the freshly minted User, never to a caller-supplied one', async () => {
    const result = await service.createWithIdentity(ACTOR, {
      ...VALID_BODY,
      documentId: 'D-1',
      note: 'walk-in',
    });

    expect(customerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUserId: CREATED_USER.id,
        fullName: VALID_BODY.fullName,
        documentId: 'D-1',
        note: 'walk-in',
      }),
    );
    expect(result.id).toBe(CREATED_CUSTOMER.id);
    expect(result.createdAt).toBe(CREATED_CUSTOMER.createdAt.toISOString());
  });
});
