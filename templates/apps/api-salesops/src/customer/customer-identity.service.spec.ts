import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import {
  COMPANY_USER_REPOSITORY,
  CUSTOMER_REPOSITORY,
  DuplicateLoginError,
  USER_REPOSITORY,
  USER_ROLES,
} from '@store-mgmt/domain';
import { CustomerIdentityService } from './customer-identity.service.js';

type RepoMock = Record<string, jest.Mock>;

const ACTOR = { companyId: 'company-caller', companyUserId: 'company-user-caller' };

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
  let companyUserRepository: RepoMock;
  let customerRepository: RepoMock;

  beforeEach(async () => {
    userRepository = { create: jest.fn().mockResolvedValue(CREATED_USER) };
    companyUserRepository = { create: jest.fn().mockResolvedValue({ id: 'assignment-1' }) };
    customerRepository = { create: jest.fn().mockResolvedValue(CREATED_CUSTOMER) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerIdentityService,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: COMPANY_USER_REPOSITORY, useValue: companyUserRepository },
        { provide: CUSTOMER_REPOSITORY, useValue: customerRepository },
      ],
    }).compile();

    service = module.get(CustomerIdentityService);
  });

  // R20 — an identity without an ACTIVE assignment is a dead login: since
  // migration 002 dropped `app_user.roles`, `JwtStrategy` 403s
  // `MISSING_COMPANY_USER` for a User with no assignment. Minting one without
  // the other would hand the customer an account that can never authenticate.
  describe('R20 — the minted identity can actually authenticate', () => {
    it('gives the created User an ACTIVE CompanyUser assignment', async () => {
      await service.createWithIdentity(ACTOR, VALID_BODY);

      expect(companyUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: CREATED_USER.id, status: 'ACTIVE' }),
      );
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

      expect(companyUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: USER_ROLES.user }),
      );
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

  // R23 — D10 #2/#3. Both the tenant scope and the audit trail come from the
  // AUTHENTICATED actor and only from there.
  describe('R23 — scoped and attributed to the caller', () => {
    it("scopes the assignment to the caller's companyId and attributes it to the caller", async () => {
      await service.createWithIdentity(ACTOR, VALID_BODY);

      expect(companyUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: ACTOR.companyId,
          createdByCompanyUserId: ACTOR.companyUserId,
        }),
      );
    });

    it('never widens to another company when a second caller mints an identity', async () => {
      const otherActor = { companyId: 'company-other', companyUserId: 'company-user-other' };

      await service.createWithIdentity(ACTOR, VALID_BODY);
      await service.createWithIdentity(otherActor, { ...VALID_BODY, login: 'otra.persona' });

      const companyIds = companyUserRepository.create.mock.calls.map(
        ([input]: [{ companyId: string }]) => input.companyId,
      );
      expect(companyIds).toEqual([ACTOR.companyId, otherActor.companyId]);
      expect(companyUserRepository.create).toHaveBeenCalledTimes(2);
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
      expect(companyUserRepository.create).not.toHaveBeenCalled();
      expect(customerRepository.create).not.toHaveBeenCalled();
    });

    it('leaves a login that 403s MISSING_COMPANY_USER — never a silently permissionless account — when write #2 fails', async () => {
      companyUserRepository.create.mockRejectedValue(new Error('connection reset'));

      await expect(service.createWithIdentity(ACTOR, VALID_BODY)).rejects.toThrow('connection reset');
      // The User exists (write #1 committed) but has no assignment, which is
      // exactly the state `JwtStrategy` rejects loudly.
      expect(userRepository.create).toHaveBeenCalledTimes(1);
      expect(customerRepository.create).not.toHaveBeenCalled();
    });

    it('writes User -> CompanyUser -> Customer in that order', async () => {
      const order: string[] = [];
      userRepository.create.mockImplementation(async () => {
        order.push('user');
        return CREATED_USER;
      });
      companyUserRepository.create.mockImplementation(async () => {
        order.push('companyUser');
        return { id: 'assignment-1' };
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
        userId: CREATED_USER.id,
        fullName: VALID_BODY.fullName,
        documentId: 'D-1',
        note: 'walk-in',
      }),
    );
    expect(result.id).toBe(CREATED_CUSTOMER.id);
    expect(result.createdAt).toBe(CREATED_CUSTOMER.createdAt.toISOString());
  });
});
