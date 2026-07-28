import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app/app.module.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `apps/api-salesops`'s e2e suites. Covers the
 * spec's full signup -> login -> refresh-rotation -> reuse-detection ->
 * change-password -> password-reset lifecycle end-to-end, plus the
 * unknown-login/wrong-password enumeration-safety scenario and a protected
 * route (`@Roles`-guarded `GET /users`) via the REAL `JwtAuthGuard`/`RolesGuard`.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  /**
   * `AuthService.signup` auto-assigns to the SOLE Company and fails loudly
   * when none exists, so every spec here needs exactly one. Upserted by slug
   * rather than created, because the row survives the per-test user cleanup.
   */
  async function ensureCompany(): Promise<string> {
    const company = await prisma.company.upsert({
      where: { slug: 'default' },
      update: {},
      create: { name: 'Tienda Prueba', slug: 'default' },
    });
    return company.id;
  }

  /** Assigns a directly-minted user (one that did not go through signup). */
  async function assignToCompany(userId: string, role: number): Promise<void> {
    await prisma.companyUser.create({
      data: { userId, companyId: await ensureCompany(), role, status: 'ACTIVE' },
    });
  }

  beforeEach(async () => {
    await ensureCompany();
  });

  afterEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    // `company_user` has NO FK to `app_user` (soft FK by design) — without
    // this, every run leaves orphan assignments behind.
    const stale = await prisma.user.findMany({
      where: { login: { startsWith: 'e2e.' } },
      select: { id: true },
    });
    await prisma.companyUser.deleteMany({ where: { userId: { in: stale.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { login: { startsWith: 'e2e.' } } });
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueLogin(tag: string): string {
    return `e2e.${tag}.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}`;
  }

  it('full lifecycle: signup -> login -> refresh rotation -> reuse-detection revokes family', async () => {
    const login = uniqueLogin('lifecycle');

    const signupResponse = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login, password: 'CorrectHorse1!', fullName: 'E2E Lifecycle User' });
    expect(signupResponse.status).toBe(201);
    expect(signupResponse.body.login).toBe(login);
    expect(signupResponse.body).not.toHaveProperty('passwordHash');
    expect(signupResponse.body.roles).toBe(1); // defaults to "user"

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'CorrectHorse1!' });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    expect(loginResponse.body.refreshToken).toEqual(expect.any(String));

    // The access token carries identity ONLY. `companyId` is resolved per
    // request from the ACTIVE `CompanyUser`, never minted into the token —
    // a token outliving a revoked assignment must not keep granting access.
    // Enforced by the `JwtAccessPayload` type; asserted here at runtime,
    // because a type cannot stop a `sign()` call from being handed extra
    // claims at some later point.
    const accessPayload: Record<string, unknown> = JSON.parse(
      Buffer.from(loginResponse.body.accessToken.split('.')[1], 'base64url').toString('utf8'),
    );
    expect(accessPayload).not.toHaveProperty('companyId');
    expect(accessPayload).not.toHaveProperty('roles');
    expect(accessPayload.sub).toEqual(expect.any(String));

    const firstRefreshToken: string = loginResponse.body.refreshToken;

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken });
    expect(refreshResponse.status).toBe(200);
    const rotatedRefreshToken: string = refreshResponse.body.refreshToken;
    expect(rotatedRefreshToken).not.toBe(firstRefreshToken);

    // Rotated token works once more (rotation itself is fine).
    const secondRotation = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken });
    expect(secondRotation.status).toBe(200);

    // Replaying the ALREADY-ROTATED first token -> reuse detected -> 401,
    // and it revokes the WHOLE family, so even the latest valid token dies.
    const replay = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken });
    expect(replay.status).toBe(401);

    const latestRotated: string = secondRotation.body.refreshToken;
    const afterFamilyRevoke = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: latestRotated });
    expect(afterFamilyRevoke.status).toBe(401);
  });

  it('change-password revokes every existing refresh token for the user', async () => {
    const login = uniqueLogin('changepw');
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login, password: 'OldPassword1!', fullName: 'E2E ChangePw User' });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'OldPassword1!' });
    const accessToken: string = loginResponse.body.accessToken;
    const refreshToken: string = loginResponse.body.refreshToken;

    const changeResponse = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' });
    expect(changeResponse.status).toBe(200);

    // The old refresh token must now be dead.
    const refreshAfterChange = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(refreshAfterChange.status).toBe(401);

    // The new password logs in; the old one no longer does.
    const loginWithOld = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'OldPassword1!' });
    expect(loginWithOld.status).toBe(401);

    const loginWithNew = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'NewPassword1!' });
    expect(loginWithNew.status).toBe(200);
  });

  it('password-reset: request -> confirm -> single-use enforced', async () => {
    const login = uniqueLogin('reset');
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login, password: 'InitialPass1!', fullName: 'E2E Reset User' });

    const requestResponse = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ login });
    expect(requestResponse.status).toBe(200);
    // SECURITY: the token is NEVER echoed on the public response.
    expect(requestResponse.body.resetToken).toBeUndefined();

    // Obtain the token OUT-OF-BAND (as the "email delivery" would in
    // production) — read it directly from the DB via Prisma.
    const user = await prisma.user.findUniqueOrThrow({ where: { login } });
    const persistedToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const resetToken: string = persistedToken.token;

    const confirmResponse = await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token: resetToken, newPassword: 'ResetPassword1!' });
    expect(confirmResponse.status).toBe(200);

    const loginWithReset = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'ResetPassword1!' });
    expect(loginWithReset.status).toBe(200);

    // Second use of the SAME token is rejected.
    const secondConfirm = await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token: resetToken, newPassword: 'AnotherPassword1!' });
    expect(secondConfirm.status).toBe(401);
  });

  it('password-reset/request returns the same generic message for an unknown login (enumeration-safe)', async () => {
    const known = uniqueLogin('known');
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login: known, password: 'SomePassword1!', fullName: 'E2E Known User' });

    const knownResponse = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ login: known });
    const unknownResponse = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ login: uniqueLogin('ghost') });

    expect(knownResponse.status).toBe(200);
    expect(unknownResponse.status).toBe(200);
    expect(unknownResponse.body.message).toBe(knownResponse.body.message);
    // SECURITY: no token field on EITHER response — same shape whether the
    // login exists or not (no account-takeover oracle, no enumeration leak).
    expect(knownResponse.body.resetToken).toBeUndefined();
    expect(unknownResponse.body.resetToken).toBeUndefined();
    expect(Object.keys(knownResponse.body).sort()).toEqual(Object.keys(unknownResponse.body).sort());
  });

  it('unknown login and wrong password reject with the SAME 401 error shape (no enumeration leak)', async () => {
    const login = uniqueLogin('enum');
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login, password: 'RightPassword1!', fullName: 'E2E Enum User' });

    const wrongPasswordResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'WrongPassword1!' });
    const unknownLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: uniqueLogin('ghost'), password: 'Whatever1!' });

    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownLoginResponse.status).toBe(401);
    expect(unknownLoginResponse.body.message).toEqual(wrongPasswordResponse.body.message);
  });

  it('signup rejects a duplicate login -> 409', async () => {
    const login = uniqueLogin('dup');
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login, password: 'FirstPassword1!', fullName: 'E2E Dup User' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ login, password: 'SecondPassword1!', fullName: 'E2E Dup User Two' });

    expect(response.status).toBe(409);
  });

  describe('protected route via RolesGuard (GET /users)', () => {
    it('rejects an unauthenticated request -> 401', async () => {
      const response = await request(app.getHttpServer()).get('/users');
      expect(response.status).toBe(401);
    });

    it('rejects an authenticated caller holding only "user" -> 403', async () => {
      const login = uniqueLogin('plain');
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ login, password: 'PlainUserPass1!', fullName: 'E2E Plain User' });
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login, password: 'PlainUserPass1!' });

      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);
      expect(response.status).toBe(403);
    });

    it('admits an admin/owner caller -> 200', async () => {
      const login = uniqueLogin('owner');
      const passwordHash = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';
      const owner = await prisma.user.create({
        data: { login, passwordHash, fullName: 'E2E Owner User' },
      });
      await assignToCompany(owner.id, 8);
      // Sign in via bcrypt-verified login requires the REAL password, not
      // the sentinel hash above — mint the user directly with a known
      // password hash instead, then log in with that plaintext.
      await prisma.user.update({
        where: { login },
        data: {
          passwordHash: await hashDevPassword('OwnerPass1!'),
        },
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login, password: 'OwnerPass1!' });
      expect(loginResponse.status).toBe(200);

      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});

async function hashDevPassword(password: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 10);
}
