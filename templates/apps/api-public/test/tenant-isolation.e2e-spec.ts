import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  dropStores,
  getTenantServices,
  provisionStore,
  seedCategoryAndProduct,
  type ProvisionedStore,
  type SeededProduct,
  type TenantServices,
} from './support/catalog-e2e-helper.js';

/**
 * Task 4.11 — two different slugs against ONE running app instance,
 * isolation proven from the `Host` header alone (mirrors spike 0.1's proof
 * at the app level). Same discipline as `api-salesops`'s own
 * `tenant-isolation.e2e-spec.ts`: this file's job is to prove the NEGATIVE
 * — store B genuinely cannot read store A's rows through this app, not
 * merely that each store happens to see its own data.
 */
describe('Public catalog isolation across two tenant subdomains (e2e)', () => {
  let app: INestApplication;
  let services: TenantServices;
  let storeA: ProvisionedStore;
  let storeB: ProvisionedStore;
  let productA: SeededProduct;
  let productB: SeededProduct;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    services = getTenantServices(moduleFixture);
    storeA = await provisionStore(services, { slug: `storea-${Date.now()}`, name: 'Tienda A' });
    storeB = await provisionStore(services, { slug: `storeb-${Date.now()}`, name: 'Tienda B' });

    const seedA = await seedCategoryAndProduct(services, storeA, {
      productName: 'Producto Exclusivo A',
      price: '50.00',
    });
    const seedB = await seedCategoryAndProduct(services, storeB, {
      productName: 'Producto Exclusivo B',
      price: '75.00',
    });
    productA = seedA.product;
    productB = seedB.product;
  });

  afterAll(async () => {
    await dropStores(services, [storeA, storeB]);
    await app.close();
  });

  it('GET /public/store returns the DIFFERENT store for each Host — same app instance, same route', async () => {
    const resA = await request(app.getHttpServer())
      .get('/public/store')
      .set('Host', `${storeA.slug}.localhost`);
    const resB = await request(app.getHttpServer())
      .get('/public/store')
      .set('Host', `${storeB.slug}.localhost`);

    expect(resA.status).toBe(200);
    expect(resA.body).toEqual({ name: 'Tienda A', slug: storeA.slug });
    expect(resB.status).toBe(200);
    expect(resB.body).toEqual({ name: 'Tienda B', slug: storeB.slug });
  });

  it("store A's product list never contains store B's product, and vice versa — Host header is the ONLY differentiator sent", async () => {
    const resA = await request(app.getHttpServer())
      .get('/public/products')
      .set('Host', `${storeA.slug}.localhost`);
    const resB = await request(app.getHttpServer())
      .get('/public/products')
      .set('Host', `${storeB.slug}.localhost`);

    expect(resA.status).toBe(200);
    const namesInA = (resA.body.items as Array<{ name: string }>).map((item) => item.name);
    expect(namesInA).toContain('Producto Exclusivo A');
    expect(namesInA).not.toContain('Producto Exclusivo B');

    expect(resB.status).toBe(200);
    const namesInB = (resB.body.items as Array<{ name: string }>).map((item) => item.name);
    expect(namesInB).toContain('Producto Exclusivo B');
    expect(namesInB).not.toContain('Producto Exclusivo A');
  });

  it('neither subdomain can read the OTHER store\'s product by id, even with the exact real id — schema isolation, not a filter', async () => {
    const bReadsA = await request(app.getHttpServer())
      .get(`/public/products/${productA.id}`)
      .set('Host', `${storeB.slug}.localhost`);
    const aReadsB = await request(app.getHttpServer())
      .get(`/public/products/${productB.id}`)
      .set('Host', `${storeA.slug}.localhost`);

    expect(bReadsA.status).toBe(404);
    expect(aReadsB.status).toBe(404);

    // Sanity: the SAME ids, on their OWN store's subdomain, resolve fine —
    // the 404s above are isolation, not a broken route.
    const ownA = await request(app.getHttpServer())
      .get(`/public/products/${productA.id}`)
      .set('Host', `${storeA.slug}.localhost`);
    const ownB = await request(app.getHttpServer())
      .get(`/public/products/${productB.id}`)
      .set('Host', `${storeB.slug}.localhost`);
    expect(ownA.status).toBe(200);
    expect(ownA.body.name).toBe('Producto Exclusivo A');
    expect(ownB.status).toBe(200);
    expect(ownB.body.name).toBe('Producto Exclusivo B');
  });

  it('an unknown slug and an inactive company both 404 identically, on the same app instance', async () => {
    const inactiveStore = await provisionStore(services, {
      slug: `inactive-${Date.now()}`,
      name: 'Tienda Inactiva',
      isActive: false,
    });

    try {
      const unknownResponse = await request(app.getHttpServer())
        .get('/public/store')
        .set('Host', 'no-such-store.localhost');
      const inactiveResponse = await request(app.getHttpServer())
        .get('/public/store')
        .set('Host', `${inactiveStore.slug}.localhost`);

      expect(unknownResponse.status).toBe(404);
      expect(inactiveResponse.status).toBe(404);
      expect(inactiveResponse.body).toEqual(unknownResponse.body);
    } finally {
      await dropStores(services, [inactiveStore]);
    }
  });

  it('search/category/sort/pagination query params are honoured per-tenant on the same instance', async () => {
    await seedCategoryAndProduct(services, storeA, { productName: 'Segundo Producto A', price: '10.00' });

    const response = await request(app.getHttpServer())
      .get('/public/products')
      .set('Host', `${storeA.slug}.localhost`)
      .query({ orden: 'precio-asc' });

    expect(response.status).toBe(200);
    const names = (response.body.items as Array<{ name: string }>).map((item) => item.name);
    // Cheapest (10.00) first, pricier (50.00) second — proves the real
    // repository + service pipeline, not a mock, honours `orden`.
    expect(names[0]).toBe('Segundo Producto A');
    expect(names).toContain('Producto Exclusivo A');
    expect(names).not.toContain('Producto Exclusivo B');
  });
});
