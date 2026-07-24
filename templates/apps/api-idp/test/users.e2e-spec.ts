import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@store-mgmt/infra-db';
import { USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { AppModule } from '../src/app/app.module.js';
import { installGlobalPipes } from '../src/main-setup.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks) — covers SECURITY FIX 4 (mass-assignment / non-whitelisted DTO
 * fields) against the REAL `ValidationPipe` wired in `main.ts`.
 */
describe('Users (e2e) — mass-assignment guard', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    installGlobalPipes(app);
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { login: { startsWith: 'e2e.massassign.' } } });
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueLogin(tag: string): string {
    return `e2e.massassign.${tag}.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function hashDevPassword(password: string): Promise<string> {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(password, 10);
  }

  async function loginAsAdmin(): Promise<string> {
    const login = uniqueLogin('admin');
    const passwordHash = await hashDevPassword('AdminPass1!');
    await prisma.user.create({
      data: { login, passwordHash, fullName: 'E2E Admin', roles: USER_ROLES.admin },
    });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login, password: 'AdminPass1!' });
    return loginResponse.body.accessToken;
  }

  it('PATCH /users/:id with a non-whitelisted "passwordHash" field is REJECTED and the stored hash is unchanged', async () => {
    const adminToken = await loginAsAdmin();

    const targetLogin = uniqueLogin('target');
    const originalHash = await hashDevPassword('OriginalPass1!');
    const target = await prisma.user.create({
      data: { login: targetLogin, passwordHash: originalHash, fullName: 'Target User', roles: USER_ROLES.user },
    });

    const evilHash = '$2b$10$evilInjectedHashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const response = await request(app.getHttpServer())
      .patch(`/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ passwordHash: evilHash });

    // Rejected by the global ValidationPipe (whitelist + forbidNonWhitelisted).
    expect(response.status).toBe(400);

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.passwordHash).toBe(originalHash);
    expect(persisted.passwordHash).not.toBe(evilHash);
  });

  it('PATCH /users/:id with an allowed field (fullName) still succeeds', async () => {
    const adminToken = await loginAsAdmin();

    const targetLogin = uniqueLogin('target2');
    const originalHash = await hashDevPassword('OriginalPass1!');
    const target = await prisma.user.create({
      data: { login: targetLogin, passwordHash: originalHash, fullName: 'Old Name', roles: USER_ROLES.user },
    });

    const response = await request(app.getHttpServer())
      .patch(`/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'New Name' });

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('New Name');
  });
});
