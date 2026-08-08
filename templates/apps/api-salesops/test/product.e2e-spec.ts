import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  authHeader,
  companyIdHeader,
  createAuthedUser,
  dropTenantSchemas,
  getTenantServices,
  tenantClientFor,
  type AuthedUser,
  type TenantPrismaClient,
  type TenantServices,
} from './support/auth-e2e-helper.js';

/**
 * Full HTTP lifecycle against a real, provisioned tenant schema (no mocks,
 * no `overrideGuard` — the REAL `TenantContextGuard` resolves `admin` from
 * the `X-Company-Id` header, spec: salesops-tenancy "The test exercises the
 * real guard, not a stub"). Guards the MONEY invariants on the REAL path:
 * `createProduct()` / the atomic field guards must run inside
 * `ProductService`, so a non-positive price / negative cost is rejected
 * with 400 and never persisted -- a regression test for the factory-bypass
 * bug (same class as the Customer C1 / Warehouse W1). Writes are
 * `owner`/`admin`-only (backend-users-roles).
 */
describe('Product (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let tenant: TenantPrismaClient;
  let admin: AuthedUser;
  let categoryId: string;

  const validProduct = () => ({
    name: 'Cafetera Express',
    description: 'Cafetera express de 15 bares.',
    price: { amount: '100.00', currency: 'USD' },
    cost: { amount: '60.00', currency: 'USD' },
    categoryId,
    image: 'https://example.com/cafetera.png',
    order: 1,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    services = getTenantServices(moduleFixture);
    admin = await createAuthedUser(services, USER_ROLES.admin);
    tenant = tenantClientFor(services, admin.companyId);
  });

  beforeEach(async () => {
    const category = await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId))
      .send({ name: 'Cafeteras', slug: 'cafeteras-prod-e2e', order: 1 });
    categoryId = category.body.id;
  });

  afterEach(async () => {
    await tenant.product.deleteMany({});
    await tenant.category.deleteMany({});
  });

  afterAll(async () => {
    await dropTenantSchemas(services, [admin.companyId]);
    await services.masterPrisma.user.deleteMany({});
    await app.close();
  });

  it('creates a product -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId))
      .send(validProduct());

    expect(response.status).toBe(201);
    expect(response.body.price).toEqual({ amount: '100.00', currency: 'USD' });
  });

  it('rejects a non-positive price -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId))
      .send({ ...validProduct(), price: { amount: '0.00', currency: 'USD' } });

    expect(response.status).toBe(400);
    const rows = await tenant.product.findMany({});
    expect(rows).toHaveLength(0);
  });

  it('rejects a negative cost -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId))
      .send({ ...validProduct(), cost: { amount: '-1.00', currency: 'USD' } });

    expect(response.status).toBe(400);
    const rows = await tenant.product.findMany({});
    expect(rows).toHaveLength(0);
  });

  it('rejects clearing price to zero on update -> 400, original price untouched', async () => {
    const created = await request(app.getHttpServer())
      .post('/products')
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId))
      .send(validProduct());

    const response = await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId))
      .send({ price: { amount: '0.00', currency: 'USD' } });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer())
      .get(`/products/${created.body.id}`)
      .set(...authHeader(admin.token))
      .set(...companyIdHeader(admin.companyId));
    expect(found.body.price).toEqual({ amount: '100.00', currency: 'USD' });
  });

  describe('RolesGuard enforcement', () => {
    it('rejects an unauthenticated write with 401', async () => {
      const response = await request(app.getHttpServer()).post('/products').send(validProduct());
      expect(response.status).toBe(401);
    });

    it('admits a plain "user" caller on a read route', async () => {
      const { token } = await createAuthedUser(services, USER_ROLES.user, admin.companyId);

      const response = await request(app.getHttpServer())
        .get('/products')
        .set(...authHeader(token))
        .set(...companyIdHeader(admin.companyId));
      expect(response.status).toBe(200);
    });
  });
});
