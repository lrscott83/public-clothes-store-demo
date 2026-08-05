import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-user.repository.spec.ts`. `RefreshToken`
 * lives on the master client (task 3.5) and `onDelete: Cascade`s off
 * `User` — see that spec's comment for why no legacy cleanup is needed
 * anymore (task 14.2).
 */
describe('PrismaRefreshTokenRepository', () => {
  let prisma: PrismaMasterService;
  let repository: PrismaRefreshTokenRepository;
  let users: PrismaUserRepository;
  let userId: string;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    repository = new PrismaRefreshTokenRepository(prisma);
    users = new PrismaUserRepository(prisma);
  });

  beforeEach(async () => {
    const user = await users.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a RefreshToken row', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const created = await repository.create({ token: 'rtid-1', userId, expiresAt });

    expect(created.token).toBe('rtid-1');
    expect(created.userId).toBe(userId);
    expect(created.isRevoked).toBe(false);
  });

  it('findByToken() round-trips a persisted RefreshToken', async () => {
    const expiresAt = new Date(Date.now() + 1000);
    await repository.create({ token: 'rtid-2', userId, expiresAt });

    const found = await repository.findByToken('rtid-2');

    expect(found).not.toBeNull();
    expect(found?.userId).toBe(userId);
  });

  it('findByToken() returns null for an unknown token', async () => {
    const found = await repository.findByToken('unknown-token');
    expect(found).toBeNull();
  });

  it('revokeIfActive() atomically revokes an active token, returns 1', async () => {
    const created = await repository.create({
      token: 'rtid-3',
      userId,
      expiresAt: new Date(Date.now() + 1000),
    });

    const count = await repository.revokeIfActive(created.id);

    expect(count).toBe(1);
    const found = await repository.findByToken('rtid-3');
    expect(found?.isRevoked).toBe(true);
  });

  it('revokeIfActive() returns 0 when the token was already revoked (concurrent-rotation race)', async () => {
    const created = await repository.create({
      token: 'rtid-4',
      userId,
      expiresAt: new Date(Date.now() + 1000),
      isRevoked: true,
    });

    const count = await repository.revokeIfActive(created.id);

    expect(count).toBe(0);
  });

  it('revokeByUserId() revokes every active token for a user, returns the count', async () => {
    await repository.create({ token: 'rtid-5', userId, expiresAt: new Date(Date.now() + 1000) });
    await repository.create({ token: 'rtid-6', userId, expiresAt: new Date(Date.now() + 1000) });

    const count = await repository.revokeByUserId(userId);

    expect(count).toBe(2);
    const first = await repository.findByToken('rtid-5');
    const second = await repository.findByToken('rtid-6');
    expect(first?.isRevoked).toBe(true);
    expect(second?.isRevoked).toBe(true);
  });

  it('deleteExpired() deletes every expired token, returns the count', async () => {
    await repository.create({ token: 'rtid-expired', userId, expiresAt: new Date(Date.now() - 1000) });
    await repository.create({ token: 'rtid-live', userId, expiresAt: new Date(Date.now() + 1000000) });

    const count = await repository.deleteExpired();

    expect(count).toBe(1);
    expect(await repository.findByToken('rtid-expired')).toBeNull();
    expect(await repository.findByToken('rtid-live')).not.toBeNull();
  });
});
