import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Full HTTP lifecycle against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as the domain/infra-db suites. Covers the spec's
 * CRUD + documentId-conflict + soft-delete + not-found scenarios end-to-end.
 */
describe('Customer (e2e)', () => {
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
    await prisma.customer.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a customer -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Ana Torres' });

    expect(response.status).toBe(201);
    expect(response.body.fullName).toBe('Ana Torres');
    expect(response.body.active).toBe(true);
  });

  it('rejects an empty fullName -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer()).post('/customers').send({ fullName: '' });

    expect(response.status).toBe(400);
    const rows = await prisma.customer.findMany({ where: { fullName: '' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects a whitespace-only fullName -> 400, never persisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: '   ' });

    expect(response.status).toBe(400);
    const rows = await prisma.customer.findMany({ where: { fullName: '   ' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects clearing fullName to empty on update -> 400, original name untouched', async () => {
    const created = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Sofía Ramos' });

    const response = await request(app.getHttpServer())
      .patch(`/customers/${created.body.id}`)
      .send({ fullName: '' });

    expect(response.status).toBe(400);
    const found = await request(app.getHttpServer()).get(`/customers/${created.body.id}`);
    expect(found.body.fullName).toBe('Sofía Ramos');
  });

  it('rejects a second customer with the same documentId -> 409', async () => {
    await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Ana Torres', documentId: 'E2E-D1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Luis Pérez', documentId: 'E2E-D1' });

    expect(response.status).toBe(409);
  });

  it('gets a customer by id -> 200', async () => {
    const created = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Marta Gómez' });

    const response = await request(app.getHttpServer()).get(`/customers/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('Marta Gómez');
  });

  it('lists only active customers by default', async () => {
    const created = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'José Díaz' });
    await request(app.getHttpServer()).delete(`/customers/${created.body.id}`);

    const response = await request(app.getHttpServer()).get('/customers');

    expect(response.status).toBe(200);
    expect(response.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('deletes a customer -> soft-delete, still retrievable with active=false, never a hard delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/customers')
      .send({ fullName: 'Yanet Cruz' });

    const deleteResponse = await request(app.getHttpServer()).delete(
      `/customers/${created.body.id}`,
    );
    expect(deleteResponse.status).toBe(200);

    const found = await request(app.getHttpServer()).get(`/customers/${created.body.id}`);
    expect(found.status).toBe(200);
    expect(found.body.active).toBe(false);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await request(app.getHttpServer()).get(
      '/customers/00000000-0000-0000-0000-000000000000',
    );

    expect(response.status).toBe(404);
  });
});
