import { ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { ICompanyRepository, IUserRepository, User as DomainUser } from '@store-mgmt/domain';
import { DuplicateCompanySlugError, DuplicateLoginError } from '@store-mgmt/domain';
import type { CreateCompanySaga } from '../company/create-company.saga.js';
import { PlatformService } from './platform.service.js';

jest.mock('bcrypt');

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

const CREATED_OWNER: DomainUser = {
  id: 'owner-1',
  login: 'nuevo.owner',
  passwordHash: VALID_HASH,
  fullName: 'Nuevo Owner',
  email: null,
  cellPhone: null,
  isActive: true,
  isSuperadmin: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

interface Deps {
  userRepository: { create: jest.Mock };
  companyRepository: { findById: jest.Mock };
  saga: { run: jest.Mock };
}

const SAGA_COMPANY = {
  id: 'company-1',
  name: 'Tienda Nueva',
  slug: 'tienda-nueva',
  isActive: true,
  schemaName: 'store_mgmt_tenant_company_1',
  type: 'catalog' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function makeDeps(): Deps {
  const userRepository = { create: jest.fn().mockResolvedValue(CREATED_OWNER) };
  const companyRepository = { findById: jest.fn().mockResolvedValue(SAGA_COMPANY) };
  const saga = {
    run: jest.fn().mockResolvedValue({
      companyId: 'company-1',
      schemaName: 'store_mgmt_tenant_company_1',
      ownerCompanyUserId: 'cu-1',
      categoriesCopied: 11,
      productsCopied: 99,
    }),
  };
  return { userRepository, companyRepository, saga };
}

function makeService(deps: Deps): PlatformService {
  return new PlatformService(
    deps.userRepository as unknown as IUserRepository,
    deps.companyRepository as unknown as ICompanyRepository,
    deps.saga as unknown as CreateCompanySaga,
  );
}

function makeInput() {
  return {
    name: 'Tienda Nueva',
    slug: 'tienda-nueva',
    type: 'catalog' as const,
    ownerLogin: 'nuevo.owner',
    temporaryPassword: 'TempPass123!',
  };
}

describe('PlatformService.createOnBehalf', () => {
  beforeEach(() => {
    (bcrypt.hash as unknown as jest.Mock).mockResolvedValue(VALID_HASH);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Scenario: "Happy path provisions store and owner" — composition order is
  // LOAD-BEARING (design D3): hash → owner User → saga({name, slug, ownerId}).
  it('composes in order: bcrypt.hash → userRepository.create → saga.run with the new owner id', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.createOnBehalf(makeInput());

    expect(bcrypt.hash).toHaveBeenCalledWith('TempPass123!', 10);
    expect(deps.userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ login: 'nuevo.owner', passwordHash: VALID_HASH }),
    );
    expect(deps.saga.run).toHaveBeenCalledWith({
      name: 'Tienda Nueva',
      slug: 'tienda-nueva',
      ownerId: 'owner-1',
    });

    // Strict ordering proof.
    const hashOrder = (bcrypt.hash as unknown as jest.Mock).mock.invocationCallOrder[0];
    const createOrder = deps.userRepository.create.mock.invocationCallOrder[0];
    const sagaOrder = deps.saga.run.mock.invocationCallOrder[0];
    expect(hashOrder).toBeLessThan(createOrder);
    expect(createOrder).toBeLessThan(sagaOrder);
  });

  it('returns the created company, the owner login, and the plaintext password', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.createOnBehalf(makeInput());

    expect(result.company.id).toBe('company-1');
    expect(result.ownerLogin).toBe('nuevo.owner');
    expect(result.temporaryPassword).toBe('TempPass123!');
  });

  // Scenario: "Duplicate owner login returns 409 without touching companies"
  it('maps a duplicate owner login to 409 and NEVER invokes the saga', async () => {
    const deps = makeDeps();
    deps.userRepository.create.mockRejectedValue(new DuplicateLoginError('login taken'));
    const service = makeService(deps);

    await expect(service.createOnBehalf(makeInput())).rejects.toThrow(ConflictException);
    expect(deps.userRepository.create).toHaveBeenCalledTimes(1);
    expect(deps.saga.run).not.toHaveBeenCalled();
  });

  // Scenario: "Duplicate slug returns 409"
  it('surfaces the saga\'s duplicate-slug failure as 409', async () => {
    const deps = makeDeps();
    deps.saga.run.mockRejectedValue(new DuplicateCompanySlugError('slug taken'));
    const service = makeService(deps);

    await expect(service.createOnBehalf(makeInput())).rejects.toThrow(ConflictException);
  });

  // Requirement: "Temporary Password Show-Once Semantics" — the plaintext
  // exists ONLY in this one response; the log carries no trace of it and
  // persistence receives only the bcrypt hash.
  it('persists only the bcrypt hash — never the plaintext password', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.createOnBehalf(makeInput());

    const persisted = deps.userRepository.create.mock.calls[0][0] as Record<string, string>;
    expect(persisted.passwordHash).toBe(VALID_HASH);
    expect(JSON.stringify(persisted)).not.toContain('TempPass123!');
  });

  it('never writes the plaintext password to any log', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const logged: unknown[] = [];
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(((...args: unknown[]) => {
        logged.push(...args);
      }) as never);
    }

    await service.createOnBehalf(makeInput());

    // Whether or not ANY log line was written, none may carry the plaintext.
    expect(JSON.stringify(logged)).not.toContain('TempPass123!');
  });
});
