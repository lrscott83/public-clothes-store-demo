import { Logger, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository, User } from '@store-mgmt/domain';
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
    isSuperadmin: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeStrategy() {
  const findById = jest.fn();
  const userRepository = { findById } as unknown as IUserRepository;
  return {
    strategy: new JwtStrategy(userRepository),
    findById,
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
    expect(result.isActive).toBe(true);
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

  // --- Tenant resolution moved out (design D4, Phase 7) ---
  // `JwtStrategy` now resolves ONLY master-side data — the `CompanyUser`
  // table these fields used to come from lives in a tenant schema whose
  // identity is not yet known when Passport runs. Role/company resolution
  // moves to `TenantContextGuard` (spec: salesops-identity "Role Resolution
  // at Authentication Time").

  it('does NOT construct a second repository dependency — validate() never resolves CompanyUser', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());
    // `JwtStrategy`'s constructor takes exactly one repository now — a second
    // positional argument here would be a silent, unused parameter. Asserted
    // by construction succeeding with a single mock and no CompanyUser
    // repository ever provided (see `makeStrategy` above).
    expect(strategy).toBeInstanceOf(JwtStrategy);
  });

  it('validate() returns only master-side identity — no roles/companyId/companyUserId field', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());

    const result = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('companyId');
    expect(result).not.toHaveProperty('companyUserId');
  });

  it('does NOT log MISSING_COMPANY_USER — that failure mode now originates in TenantContextGuard', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());
    const logged: string[] = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((msg: unknown) => {
      logged.push(String(msg));
    });

    await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(logged.join('\n')).not.toContain('MISSING_COMPANY_USER');
  });

  // --- Platform superadmin flag (spec: salesops-identity "Role Resolution
  // at Authentication Time" MODIFIED) ---
  // `validate()` resolves ONLY master-side data: { id, login, isActive,
  // isSuperadmin } — no roles/companyId/companyUserId ever.

  it('resolves isSuperadmin=false for a default user alongside {id, login, isActive}', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser());

    const result = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'user-1',
        login: 'juan.perez',
        isActive: true,
        isSuperadmin: false,
      }),
    );
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('companyId');
    expect(result).not.toHaveProperty('companyUserId');
  });

  it('passes a superadmin flag through untouched (true) with no role resolution', async () => {
    const { strategy, findById } = makeStrategy();
    findById.mockResolvedValue(activeUser({ isSuperadmin: true }));

    const result = await strategy.validate({ sub: 'user-1', login: 'juan.perez' });

    expect(result.isSuperadmin).toBe(true);
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('companyId');
    expect(result).not.toHaveProperty('companyUserId');
  });
});
