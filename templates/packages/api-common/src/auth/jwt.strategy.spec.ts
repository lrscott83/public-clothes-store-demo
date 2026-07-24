import { UnauthorizedException } from '@nestjs/common';
import type { IUserRepository, User } from '@store-mgmt/domain';
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
    roles: USER_ROLES.user,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeStrategy() {
  const findById = jest.fn();
  const userRepository = { findById } as unknown as IUserRepository;
  return { strategy: new JwtStrategy(userRepository), findById };
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
});
