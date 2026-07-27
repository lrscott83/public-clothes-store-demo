import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { authHeader, createAuthedUser } from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks). Guards the W1 invariant on the REAL path: the `createWarehouse()`
 * domain factory must run inside `WarehouseService`, so an empty/whitespace
 * name is rejected with 400 and never persisted — a regression test for the
 * factory-bypass bug (same class as the Customer C1). Writes are
 * `owner`/`admin`-only (backend-users-roles).
 */
describe('Warehouse (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    adminToken = (await createAuthedUser(prisma, USER_ROLES.admin)).token;
  });

  afterEach(async () => {
    await prisma.warehouse.deleteMany({});
  });

  afterAll(async () => {
    // `company_user` has NO FK to `app_user` (soft FK by design), so deleting
    // users without this leaves orphan assignments accumulating across runs.
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('creates a warehouse -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(adminToken))
      .send({ name: 'Pinar del Río' });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Pinar del Río');
    expect(response.body.active).toBe(true);
  });

  it('rejects an empty name -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(adminToken))
      .send({ name: '' });

    expect(response.status).toBe(400);
    const rows = await prisma.warehouse.findMany({ where: { name: '' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a whitespace-only name -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(adminToken))
      .send({ name: '   ' });

    expect(response.status).toBe(400);
    const rows = await prisma.warehouse.findMany({ where: { name: '   ' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects clearing name to empty on update -> 400, original name untouched', async () => {
    const created = await request(app.getHttpServer())
      .post('/warehouses')
      .set(...authHeader(adminToken))
      .send({ name: 'Havana Central' });

    const response = await request(app.getHttpServer())
      .patch(`/warehouses/${created.body.id}`)
      .set(...authHeader(adminToken))
      .send({ name: '' });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer())
      .get(`/warehouses/${created.body.id}`)
      .set(...authHeader(adminToken));
    expect(found.body.name).toBe('Havana Central');
  });

  describe('RolesGuard enforcement', () => {
    it('rejects an unauthenticated write with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/warehouses')
        .send({ name: 'No Auth Warehouse' });

      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller writing with 403', async () => {
      const { token } = await createAuthedUser(prisma, USER_ROLES.user);

      const response = await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(token))
        .send({ name: 'Wrong Role Warehouse' });

      expect(response.status).toBe(403);
    });
  });
});
