import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import type { CompanyUser, ICompanyUserRepository, IUserRepository, User } from '@store-mgmt/domain';
import { USER_ROLES } from '@store-mgmt/domain';
import { JwtStrategy } from './jwt.strategy.js';

function activeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    login: 'juan.perez',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    fullName: 'Juan Perez',
    email: null,
    cellPhone: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function companyUser(overrides: Partial<CompanyUser> = {}): CompanyUser {
  return {
    id: 'cu-1',
    userId: 'user-1',
    companyId: 'company-1',
    role: USER_ROLES.owner,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeStrategy() {
  const findById = jest.fn();
  const findActiveByUserId = jest.fn().mockResolvedValue(companyUser());
  const userRepository = { findById } as unknown as IUserRepository;
  const companyUserRepository = { findActiveByUserId } as unknown as ICompanyUserRepository;
  return {
    strategy: new JwtStrategy(userRepository, companyUserRepository),
    findById,
    findActiveByUserId,
  };
}

describe('JwtStrategy.validate', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('active user → resolves via IUserRepository.findById and strips passwordHash', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());

    const result = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(findById).toHaveBeenCalledWith('user-1');
    expect(result.id).toBe('user-1');
    expect(result.login).toBe('juan.perez');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('caches the resolved user → a second validate within the TTL does not re-query', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());

    const first = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });
    const second = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(findById).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('re-queries once the ~30s cache TTL has elapsed', async () => {
    jest.useFakeTimers();
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());

    await strategy.validate({ sub: 'user-1', login: 'juan.perez' });
    jest.advanceTimersByTime(31_000);
    await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(findById).toHaveBeenCalledTimes(2);
  });

  it('missing user → UnauthorizedException', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'ghost', login: 'nobody' })).rejects.toThrow(UnauthorizedException);
  });

  it('inactive user → UnauthorizedException (token valid but account deactivated)', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser({ isActive: false }));

    await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(UnauthorizedException);
  });

  it('does NOT cache a rejected (inactive) user → stays rejected on retry, re-queries each time', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser({ isActive: false }));

    await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(UnauthorizedException);

    expect(findById).toHaveBeenCalledTimes(2);
  });

  // --- CompanyUser role resolution (Phase 2 cutover) ---

  it('sources `roles` from CompanyUser.role, NEVER from the User row, and exposes companyId', async () => {
    const { strategy, findById, findActiveByUserId } = makeStrategy();
    // Since migration 002 the User row cannot carry a bitmask at all — the
    // assignment is the only possible source, and this asserts it is the one
    // actually read.
    findById.mockResolvedValue(activeUser());
    findActiveByUserId.mockResolvedValue(companyUser({ role: USER_ROLES.admin }));

    const result = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(findActiveByUserId).toHaveBeenCalledWith('user-1');
    expect(result.roles).toBe(USER_ROLES.admin);
    expect(result.companyId).toBe('company-1');
  });

  it('role bitmask 0 is a VALID zero-permission assignment, not a missing one', async () => {
    const { strategy, findById, findActiveByUserId } = makeStrategy();
    findById.mockResolvedValue(activeUser());
    findActiveByUserId.mockResolvedValue(companyUser({ role: 0 }));

    const result = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(result.roles).toBe(0);
  });

  it('missing CompanyUser → ForbiddenException (403, NOT 401) and logs MISSING_COMPANY_USER', async () => {
    const { strategy, findById, findActiveByUserId } = makeStrategy();
    findById.mockResolvedValue(activeUser());
    findActiveByUserId.mockResolvedValue(null);
    const logged: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((msg: unknown) => {
      logged.push(String(msg));
    });

    await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(ForbiddenException);
    expect(logged.join('\n')).toContain('MISSING_COMPANY_USER');
  });

  it.each(['REVOKED', 'SUSPENDED'] as const)(
    'a %s CompanyUser is treated exactly like a missing one → ForbiddenException',
    async (status) => {
      const { strategy, findById, findActiveByUserId } = makeStrategy();
      findById.mockResolvedValue(activeUser());
      findActiveByUserId.mockResolvedValue(companyUser({ status }));

      await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(ForbiddenException);
    },
  );

  it('does NOT cache a rejected (missing CompanyUser) resolution → re-queries each time', async () => {
    const { strategy, findById, findActiveByUserId } = makeStrategy();
    findById.mockResolvedValue(activeUser());
    findActiveByUserId.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(ForbiddenException);
    await expect(strategy.validate({ sub: 'user-1', login: 'juan.perez' })).rejects.toThrow(ForbiddenException);

    expect(findActiveByUserId).toHaveBeenCalledTimes(2);
  });

  it('cache hit skips BOTH repositories — one joined projection, one invalidation window (A7)', async () => {
    const { strategy, findById, findActiveByUserId } = makeStrategy();
    findById.mockResolvedValue(activeUser());

    await strategy.validate({ sub: 'user-1', login: 'juan.perez' });
    await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(findById).toHaveBeenCalledTimes(1);
    expect(findActiveByUserId).toHaveBeenCalledTimes(1);
  });
});
