import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IMAGE_STORE } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { mockTenantContextService, overridePublicTenant, SAMPLE_TENANT } from '../test-support/tenant-test-helpers.js';
import { computeImageKey } from './image-url.js';
import { ProductImageController } from './product-image.controller.js';
import { PublicProductService } from './public-product.service.js';

type PublicProductServiceMock = { findActiveById: jest.Mock };
type ProductImageStoreMock = { open: jest.Mock };

const CURRENT_REF = 'products/current-image.webp';
const CURRENT_KEY = computeImageKey(CURRENT_REF);

function buildProductItem(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      id: 'product-uuid-1',
      name: 'Cafetera Express',
      description: 'Cafetera express de 15 bares.',
      price: { minorUnits: 10000n, currency: 'USD' },
      percentDiscountPrice: 0n,
      discountPrice: 0n,
      cost: { minorUnits: 6000n, currency: 'USD' },
      categoryId: 'category-uuid-1',
      image: CURRENT_REF,
      isNew: false,
      order: 1,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    finalPrice: { minorUnits: 10000n, currency: 'USD' },
    ...overrides,
  };
}

async function* asyncBytes(chunks: Buffer[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function buildApp(
  service: PublicProductServiceMock,
  store: ProductImageStoreMock,
): Promise<INestApplication> {
  const builder = overridePublicTenant(
    Test.createTestingModule({
      controllers: [ProductImageController],
      providers: [
        { provide: PublicProductService, useValue: service },
        { provide: IMAGE_STORE, useValue: store },
        { provide: TenantContextService, useValue: mockTenantContextService() },
      ],
    }),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('ProductImageController', () => {
  let app: INestApplication;
  let service: PublicProductServiceMock;
  let store: ProductImageStoreMock;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    service = { findActiveById: jest.fn() };
    store = { open: jest.fn() };
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    errorSpy.mockRestore();
    await app?.close();
  });

  it('a missing product returns 404, store.open is never called', async () => {
    service.findActiveById.mockResolvedValue(null);
    app = await buildApp(service, store);

    const response = await request(app.getHttpServer()).get(
      `/public/products/does-not-exist/image/${CURRENT_KEY}`,
    );

    expect(response.status).toBe(404);
    expect(store.open).not.toHaveBeenCalled();
  });

  it('an inactive product returns 404 — findActiveById already excludes it, never reachable through this endpoint', async () => {
    service.findActiveById.mockResolvedValue(null); // PublicProductService.findActiveById returns null for inactive.
    app = await buildApp(service, store);

    const response = await request(app.getHttpServer()).get(
      `/public/products/product-uuid-1/image/${CURRENT_KEY}`,
    );

    expect(response.status).toBe(404);
  });

  it('a stale imageKey (from a previous ref) returns 404, store.open is never called', async () => {
    service.findActiveById.mockResolvedValue(buildProductItem());
    app = await buildApp(service, store);

    const staleKey = computeImageKey('products/old-image.webp');
    const response = await request(app.getHttpServer()).get(
      `/public/products/product-uuid-1/image/${staleKey}`,
    );

    expect(response.status).toBe(404);
    expect(store.open).not.toHaveBeenCalled();
  });

  it('a ref that fails assertImageRef returns 404 and logs PRODUCT_IMAGE_REF_INVALID, never 400', async () => {
    // Legacy/external image value (design.md §5's "seeded rows satisfy the
    // ref grammar IF the bytes are on the volume" — this one does not
    // satisfy the grammar at all, e.g. a pre-migration absolute URL).
    service.findActiveById.mockResolvedValue(buildProductItem({
      product: { ...buildProductItem().product, image: 'https://example.com/legacy.png' },
    }));
    app = await buildApp(service, store);

    const invalidRefKey = computeImageKey('https://example.com/legacy.png');
    const response = await request(app.getHttpServer()).get(
      `/public/products/product-uuid-1/image/${invalidRefKey}`,
    );

    expect(response.status).toBe(404);
    expect(store.open).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('PRODUCT_IMAGE_REF_INVALID'));
  });

  it('open() returning null (row present, file gone) returns 404 and logs PRODUCT_IMAGE_MISSING, never 500, never a placeholder', async () => {
    service.findActiveById.mockResolvedValue(buildProductItem());
    store.open.mockResolvedValue(null);
    app = await buildApp(service, store);

    const response = await request(app.getHttpServer()).get(
      `/public/products/product-uuid-1/image/${CURRENT_KEY}`,
    );

    expect(response.status).toBe(404);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('PRODUCT_IMAGE_MISSING'));
  });

  it('passes the resolved tenant companyId explicitly to store.open — D1 defense in depth, never ambient state', async () => {
    service.findActiveById.mockResolvedValue(buildProductItem());
    store.open.mockResolvedValue({
      stream: asyncBytes([Buffer.from('bytes')]),
      contentType: 'image/webp',
      byteLength: 5,
    });
    app = await buildApp(service, store);

    await request(app.getHttpServer()).get(`/public/products/product-uuid-1/image/${CURRENT_KEY}`);

    expect(store.open).toHaveBeenCalledWith(SAMPLE_TENANT.companyId, CURRENT_REF);
  });

  it('If-None-Match matching the current key returns 304 with an empty body and the same Cache-Control', async () => {
    service.findActiveById.mockResolvedValue(buildProductItem());
    app = await buildApp(service, store);

    const response = await request(app.getHttpServer())
      .get(`/public/products/product-uuid-1/image/${CURRENT_KEY}`)
      .set('If-None-Match', `"${CURRENT_KEY}"`);

    expect(response.status).toBe(304);
    expect(response.body).toEqual({});
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(store.open).not.toHaveBeenCalled();
  });

  it('a fresh request streams the bytes with 200 and the exact D6 header set', async () => {
    service.findActiveById.mockResolvedValue(buildProductItem());
    store.open.mockResolvedValue({
      stream: asyncBytes([Buffer.from('hello '), Buffer.from('world')]),
      contentType: 'image/webp',
      byteLength: 11,
    });
    app = await buildApp(service, store);

    const response = await request(app.getHttpServer()).get(
      `/public/products/product-uuid-1/image/${CURRENT_KEY}`,
    );

    expect(response.status).toBe(200);
    // superagent buffers a binary content-type (`image/webp`) into
    // `response.body` as a Buffer rather than populating `.text`.
    expect(Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.text).toBe(
      'hello world',
    );
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['content-length']).toBe('11');
    expect(response.headers['etag']).toBe(`"${CURRENT_KEY}"`);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers.vary).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
