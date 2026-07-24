import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { authHeader, createAuthedUser } from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks). Guards the invariant on the REAL path: `createCategory()` /
 * the atomic field guards must run inside `CategoryService`, so a blank
 * name/slug is rejected with 400 and never persisted — a regression test for
 * the factory-bypass bug (same class as the Customer C1 / Warehouse W1).
 * Writes are `owner`/`admin`-only (backend-users-roles) — every write below
 * authenticates as an `admin`; guard behavior itself (401/403) is asserted
 * once at the bottom.
 */
describe('Category (e2e)', () => {
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
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('creates a category -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(adminToken))
      .send({ name: 'Cafeteras', slug: 'cafeteras-e2e', order: 1 });

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe('cafeteras-e2e');
    expect(response.body.active).toBe(true);
  });

  it('rejects an empty name -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(adminToken))
      .send({ name: '', slug: 'blank-name', order: 1 });

    expect(response.status).toBe(400);
    const rows = await prisma.category.findMany({ where: { slug: 'blank-name' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a whitespace-only slug -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(adminToken))
      .send({ name: 'Cafeteras', slug: '   ', order: 1 });

    expect(response.status).toBe(400);
    const rows = await prisma.category.findMany({ where: { name: 'Cafeteras' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects clearing slug to empty on update -> 400, original slug untouched', async () => {
    const created = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(adminToken))
      .send({ name: 'Cafeteras', slug: 'cafeteras-keep', order: 1 });

    const response = await request(app.getHttpServer())
      .patch(`/categories/${created.body.id}`)
      .set(...authHeader(adminToken))
      .send({ slug: '' });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer())
      .get(`/categories/${created.body.id}`)
      .set(...authHeader(adminToken));
    expect(found.body.slug).toBe('cafeteras-keep');
  });

  describe('RolesGuard enforcement', () => {
    it('rejects an unauthenticated write with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'no-auth', order: 1 });

      expect(response.status).toBe(401);
    });

    it('rejects a plain "user" caller writing with 403', async () => {
      const { token } = await createAuthedUser(prisma, USER_ROLES.user);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set(...authHeader(token))
        .send({ name: 'Cafeteras', slug: 'wrong-role', order: 1 });

      expect(response.status).toBe(403);
    });

    it('admits a plain "user" caller on a read route', async () => {
      const { token } = await createAuthedUser(prisma, USER_ROLES.user);

      const response = await request(app.getHttpServer()).get('/categories').set(...authHeader(token));

      expect(response.status).toBe(200);
    });
  });
});
