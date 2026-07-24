import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { authHeader, createAuthedUser } from './support/auth-e2e-helper.js';

/** Bcrypt hash shape accepted by the domain `passwordHash` invariant -- never a real credential. */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks) -- same discipline as the domain/infra-db suites. Covers the spec's
 * CRUD + documentId-conflict + soft-delete + not-found scenarios end-to-end.
 * Every `Customer` now requires an existing `User` via `userId` (1:1,
 * backend-users-roles) -- `createTestUser` mints a fresh one per call (the
 * customer's OWN linked user, distinct from the AUTHENTICATED caller below).
 * Every route is `owner`/`admin`/`sales_operator`-only -- every request
 * authenticates as a `sales_operator` caller.
 */
describe('Customer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let callerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  beforeEach(async () => {
    callerToken = (await createAuthedUser(prisma, USER_ROLES.sales_operator)).token;
  });

  afterEach(async () => {
    await prisma.customer.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestUser(fullName: string): Promise<string> {
    const user = await prisma.user.create({
      data: { login: `e2e.${randomUUID()}`, passwordHash: VALID_HASH, fullName },
    });
    return user.id;
  }

  it('creates a customer -> 201', async () => {
    const userId = await createTestUser('Ana Torres');

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Ana Torres', userId });

    expect(response.status).toBe(201);
    expect(response.body.fullName).toBe('Ana Torres');
    expect(response.body.userId).toBe(userId);
    expect(response.body.active).toBe(true);
  });

  it('rejects an empty fullName -> 400, never persisted', async () => {
    const userId = await createTestUser('Empty Name Owner');

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: '', userId });

    expect(response.status).toBe(400);
    const rows = await prisma.customer.findMany({ where: { fullName: '' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a whitespace-only fullName -> 400, never persisted', async () => {
    const userId = await createTestUser('Whitespace Name Owner');

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: '   ', userId });

    expect(response.status).toBe(400);
    const rows = await prisma.customer.findMany({ where: { fullName: '   ' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a missing userId -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'No User Given' });

    expect(response.status).toBe(400);
    const rows = await prisma.customer.findMany({ where: { fullName: 'No User Given' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a userId that does not reference an existing User -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Ghost User', userId: '00000000-0000-0000-0000-000000000000' });

    expect(response.status).toBe(400);
    const rows = await prisma.customer.findMany({ where: { fullName: 'Ghost User' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a second customer with the same userId -> 409 (1:1)', async () => {
    const userId = await createTestUser('Shared User');
    await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'First Owner', userId })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Second Owner', userId });

    expect(response.status).toBe(409);
  });

  it('rejects clearing fullName to empty on update -> 400, original name untouched', async () => {
    const userId = await createTestUser('Sofía Ramos');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Sofía Ramos', userId });

    const response = await request(app.getHttpServer())
      .patch(`/customers/${created.body.id}`)
      .set(...authHeader(callerToken))
      .send({ fullName: '' });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set(...authHeader(callerToken));
    expect(found.body.fullName).toBe('Sofía Ramos');
  });

  it('rejects a second customer with the same documentId -> 409', async () => {
    const userIdA = await createTestUser('Ana Torres');
    const userIdB = await createTestUser('Luis Pérez');
    await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Ana Torres', userId: userIdA, documentId: 'E2E-D1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Luis Pérez', userId: userIdB, documentId: 'E2E-D1' });

    expect(response.status).toBe(409);
  });

  it('gets a customer by id -> 200', async () => {
    const userId = await createTestUser('Marta Gómez');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Marta Gómez', userId });

    const response = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set(...authHeader(callerToken));

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('Marta Gómez');
  });

  it('lists only active customers by default', async () => {
    const userId = await createTestUser('José Díaz');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'José Díaz', userId });
    await request(app.getHttpServer())
      .delete(`/customers/${created.body.id}`)
      .set(...authHeader(callerToken));

    const response = await request(app.getHttpServer()).get('/customers').set(...authHeader(callerToken));

    expect(response.status).toBe(200);
    expect(response.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('deletes a customer -> soft-delete, still retrievable with active=false, never a hard delete', async () => {
    const userId = await createTestUser('Yanet Cruz');
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(callerToken))
      .send({ fullName: 'Yanet Cruz', userId });

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/customers/${created.body.id}`)
      .set(...authHeader(callerToken));
    expect(deleteResponse.status).toBe(200);

    const found = await request(app.getHttpServer())
      .get(`/customers/${created.body.id}`)
      .set(...authHeader(callerToken));
    expect(found.status).toBe(200);
    expect(found.body.active).toBe(false);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await request(app.getHttpServer())
      .get('/customers/00000000-0000-0000-0000-000000000000')
      .set(...authHeader(callerToken));

    expect(response.status).toBe(404);
  });

  describe('RolesGuard enforcement (owner/admin/sales_operator only)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await request(app.getHttpServer()).get('/customers');
      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller with 403 -- customer data is cockpit-internal', async () => {
      const { token } = await createAuthedUser(prisma, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/customers').set(...authHeader(token));
      expect(response.status).toBe(403);
    });
  });
});
