import { DuplicateLoginError } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { wipeCompanyUserDependents } from '../db-cleanup.spec-helper.js';

/** Bcrypt hash shape accepted by the `passwordHash` invariant — never a real credential. */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-customer.repository.spec.ts`.
 */
describe('PrismaUserRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaUserRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaUserRepository(prisma);
  });

  afterEach(async () => {
    // `company_user` has NO FK to `app_user` (soft FK by design) — deleting
    // users alone would leave orphan assignments behind and trip the §7
    // backfill gate.
    await wipeCompanyUserDependents(prisma);
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a User with a real DB-generated UUID id and null email/cellPhone', async () => {
    const created = await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.login).toBe('jdoe');
    expect(created.fullName).toBe('Jane Doe');
    expect(created.email).toBeNull();
    expect(created.cellPhone).toBeNull();
    expect(created.isActive).toBe(true);
    expect(created).not.toHaveProperty('roles');
  });

  it('rejects a duplicate login on create with DuplicateLoginError', async () => {
    await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });

    await expect(
      repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Impostor' }),
    ).rejects.toThrow(DuplicateLoginError);
  });

  it('findByLogin() round-trips a persisted User', async () => {
    await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });

    const found = await repository.findByLogin('jdoe');

    expect(found).not.toBeNull();
    expect(found?.fullName).toBe('Jane Doe');
  });

  it('findByLogin() returns null for an unknown login', async () => {
    const found = await repository.findByLogin('unknown-login');
    expect(found).toBeNull();
  });

  it('findById() round-trips a persisted User', async () => {
    const created = await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.login).toBe('jdoe');
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('accepts explicit email and cellPhone', async () => {
    const created = await repository.create({
      login: 'jdoe',
      passwordHash: VALID_HASH,
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      cellPhone: '555-1234',
    });

    expect(created.email).toBe('jane@example.com');
    expect(created.cellPhone).toBe('555-1234');
  });

  it('update() persists a partial patch', async () => {
    const created = await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });

    const updated = await repository.update(created.id, { isActive: false });

    expect(updated.isActive).toBe(false);
    expect(updated.login).toBe('jdoe');
  });

  it('SECURITY (FIX 4): update() NEVER writes passwordHash, even if a caller forces it through the patch object', async () => {
    const created = await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    const evilHash = '$2b$10$evilInjectedHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    // `as any` simulates a caller that bypasses the `UserUpdateInput` type
    // (e.g. a bug, or a future non-TS caller) — the repository itself must
    // be the last line of defense, independent of the type system.
    await repository.update(created.id, { fullName: 'Jane D.', passwordHash: evilHash } as never);

    const found = await repository.findByLogin('jdoe');
    expect(found?.fullName).toBe('Jane D.');
    expect(found?.passwordHash).toBe(VALID_HASH);
    expect(found?.passwordHash).not.toBe(evilHash);
  });

  it('updatePassword() is the ONLY path that changes passwordHash', async () => {
    const created = await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    const newHash = '$2b$10$newRealHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    const updated = await repository.updatePassword(created.id, newHash);

    expect(updated.passwordHash).toBe(newHash);
    const found = await repository.findByLogin('jdoe');
    expect(found?.passwordHash).toBe(newHash);
  });

  it('list() returns every persisted User', async () => {
    await repository.create({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    await repository.create({ login: 'asmith', passwordHash: VALID_HASH, fullName: 'Ann Smith' });

    const all = await repository.list();

    expect(all.map((u) => u.login).sort()).toEqual(['asmith', 'jdoe']);
  });
});
