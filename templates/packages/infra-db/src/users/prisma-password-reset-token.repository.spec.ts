import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-refresh-token.repository.spec.ts`.
 * `PasswordResetToken` lives on the master client (task 3.5) and
 * `onDelete: Cascade`s off `User` — see that spec's comment for why no
 * legacy cleanup is needed anymore (task 14.2).
 */
describe('PrismaPasswordResetTokenRepository', () => {
  let prisma: PrismaMasterService;
  let repository: PrismaPasswordResetTokenRepository;
  let users: PrismaUserRepository;
  let userId: string;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    repository = new PrismaPasswordResetTokenRepository(prisma);
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

  it('create() persists a PasswordResetToken row, isUsed defaults to false', async () => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const created = await repository.create({ token: 'reset-1', userId, expiresAt });

    expect(created.token).toBe('reset-1');
    expect(created.userId).toBe(userId);
    expect(created.isUsed).toBe(false);
  });

  it('findByToken() round-trips a persisted PasswordResetToken', async () => {
    await repository.create({ token: 'reset-2', userId, expiresAt: new Date(Date.now() + 1000) });

    const found = await repository.findByToken('reset-2');

    expect(found).not.toBeNull();
    expect(found?.userId).toBe(userId);
  });

  it('findByToken() returns null for an unknown token', async () => {
    const found = await repository.findByToken('unknown-token');
    expect(found).toBeNull();
  });

  it('markAsUsed() flips isUsed to true', async () => {
    const created = await repository.create({
      token: 'reset-3',
      userId,
      expiresAt: new Date(Date.now() + 1000),
    });

    await repository.markAsUsed(created.id);

    const found = await repository.findByToken('reset-3');
    expect(found?.isUsed).toBe(true);
  });

  it('markAsUsed() on an already-used token is a safe no-op (single-use enforced by the app service)', async () => {
    const created = await repository.create({
      token: 'reset-4',
      userId,
      expiresAt: new Date(Date.now() + 1000),
      isUsed: true,
    });

    await expect(repository.markAsUsed(created.id)).resolves.toBeUndefined();
  });

  it('revokeByUserId() marks every unused token for a user as used, returns the count', async () => {
    await repository.create({ token: 'reset-5', userId, expiresAt: new Date(Date.now() + 1000) });
    await repository.create({ token: 'reset-6', userId, expiresAt: new Date(Date.now() + 1000) });

    const count = await repository.revokeByUserId(userId);

    expect(count).toBe(2);
    expect((await repository.findByToken('reset-5'))?.isUsed).toBe(true);
    expect((await repository.findByToken('reset-6'))?.isUsed).toBe(true);
  });

  it('deleteExpired() deletes every expired token, returns the count', async () => {
    await repository.create({ token: 'reset-expired', userId, expiresAt: new Date(Date.now() - 1000) });
    await repository.create({ token: 'reset-live', userId, expiresAt: new Date(Date.now() + 1000000) });

    const count = await repository.deleteExpired();

    expect(count).toBe(1);
    expect(await repository.findByToken('reset-expired')).toBeNull();
    expect(await repository.findByToken('reset-live')).not.toBeNull();
  });
});
