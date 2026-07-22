import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks). Guards the invariant on the REAL path: `createCategory()` /
 * the atomic field guards must run inside `CategoryService`, so a blank
 * name/slug is rejected with 400 and never persisted — a regression test for
 * the factory-bypass bug (same class as the Customer C1 / Warehouse W1).
 */
describe('Category (e2e)', () => {
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

  afterEach(async () => {
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a category -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Cafeteras', slug: 'cafeteras-e2e', order: 1 });

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe('cafeteras-e2e');
    expect(response.body.active).toBe(true);
  });

  it('rejects an empty name -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: '', slug: 'blank-name', order: 1 });

    expect(response.status).toBe(400);
    const rows = await prisma.category.findMany({ where: { slug: 'blank-name' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a whitespace-only slug -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Cafeteras', slug: '   ', order: 1 });

    expect(response.status).toBe(400);
    const rows = await prisma.category.findMany({ where: { name: 'Cafeteras' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects clearing slug to empty on update -> 400, original slug untouched', async () => {
    const created = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Cafeteras', slug: 'cafeteras-keep', order: 1 });

    const response = await request(app.getHttpServer())
      .patch(`/categories/${created.body.id}`)
      .send({ slug: '' });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer()).get(`/categories/${created.body.id}`);
    expect(found.body.slug).toBe('cafeteras-keep');
  });
});
