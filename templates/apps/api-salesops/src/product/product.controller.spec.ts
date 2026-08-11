import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { InvalidMoneyError, InvalidProductError, PRODUCT_IMAGE_STORE, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

type ProductServiceMock = {
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  findById: jest.Mock;
  list: jest.Mock;
};

type ImageStoreMock = { put: jest.Mock };

/**
 * Minimal valid 1x1 PNG (real bytes, not a stub) — lets the upload tests
 * exercise the REAL `sharp` decode inside `normalizeImage` (design.md D10:
 * the pipe is a cheap filter, sharp is the real gate). `store.put` is
 * mocked; `normalizeImage` is NOT — the security property under test is
 * that `sharp` genuinely decodes/re-encodes bytes and that a hostile
 * filename is never consulted (`PutProductImageInput` has no filename
 * field at all).
 */
const REAL_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

/** Definitely not an image — no magic number any decoder recognizes. */
const NOT_AN_IMAGE_BYTES = Buffer.from('this is definitely not an image file');

const sampleResponse = {
  id: 'product-uuid-1',
  name: 'Cafetera Express',
  description: 'Cafetera express de 15 bares.',
  sku: null,
  barcode: null,
  price: { amount: '100.00', currency: 'USD' },
  percentDiscountPrice: '20.00',
  discountPrice: '5.00',
  cost: { amount: '60.00', currency: 'USD' },
  finalPrice: { amount: '75.00', currency: 'USD' },
  isOffer: true,
  categoryId: 'category-uuid-1',
  image: 'https://example.com/cafetera.png',
  isNew: false,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Builds a test app with `JwtAuthGuard`/`TenantContextGuard` overridden to inject `req.user`/`req.tenant` (`roles: null` -> 401), keeping the REAL `RolesGuard`. */
async function buildApp(
  service: ProductServiceMock,
  roles: number | null,
  store: ImageStoreMock,
): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [ProductController],
        providers: [
          { provide: ProductService, useValue: service },
          { provide: TenantContextService, useValue: mockTenantContextService() },
          { provide: PRODUCT_IMAGE_STORE, useValue: store },
          RolesGuard,
        ],
      }),
      roles,
    ),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('ProductController', () => {
  let app: INestApplication;
  let service: ProductServiceMock;
  let store: ImageStoreMock;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
    };
    store = {
      put: jest.fn(),
    };

    // `admin` passes every role gate (super-root) — keeps pre-existing tests
    // focused on behavior, not on the role matrix (that's covered below).
    app = await buildApp(service, USER_ROLES.admin, store);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /products', () => {
    it('returns 201 with string fields plus derived finalPrice/isOffer', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'Cafetera express de 15 bares.',
        price: { amount: '100.00', currency: 'USD' },
        percentDiscountPrice: '20.00',
        discountPrice: '5.00',
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('accepts price and cost denominated in DIFFERENT currencies', async () => {
      service.create.mockResolvedValue({
        ...sampleResponse,
        price: { amount: '100.00', currency: 'EUR' },
        cost: { amount: '60.00', currency: 'MN' },
        finalPrice: { amount: '75.00', currency: 'EUR' },
      });

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'Cafetera express de 15 bares.',
        price: { amount: '100.00', currency: 'EUR' },
        cost: { amount: '60.00', currency: 'MN' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(201);
      expect(response.body.price).toEqual({ amount: '100.00', currency: 'EUR' });
      expect(response.body.cost).toEqual({ amount: '60.00', currency: 'MN' });
    });

    it('rejects an unknown price currency with 400 — never a silent 500', async () => {
      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'ARS' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown cost currency with 400 — never a silent 500', async () => {
      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'USD' },
        cost: { amount: '60.00', currency: 'ARS' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('maps a missing-category InvalidProductError to 400', async () => {
      service.create.mockRejectedValue(new InvalidProductError('Category "does-not-exist" does not exist'));

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'USD' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'does-not-exist',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
    });

    it('maps a malformed decimal InvalidMoneyError to 400', async () => {
      service.create.mockRejectedValue(new InvalidMoneyError('Invalid decimal string: "not-a-number"'));

      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: 'not-a-number', currency: 'USD' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /products', () => {
    it('returns the active-only list by default, each item carrying derived fields', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/products');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith(false, undefined);
    });
  });

  describe('GET /products/:id', () => {
    it('returns 200 for a found product, including soft-deleted (historical references)', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, active: false });

      const response = await request(app.getHttpServer()).get('/products/product-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body.active).toBe(false);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/products/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /products/:id', () => {
    it('returns 200 with the updated product', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, name: 'Updated' });

      const response = await request(app.getHttpServer())
        .patch('/products/product-uuid-1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated');
    });
  });

  describe('DELETE /products/:id', () => {
    it('soft-deletes and returns 200, excluded from default listing afterward', async () => {
      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1');

      expect(response.status).toBe(200);
      expect(service.softDelete).toHaveBeenCalledWith('product-uuid-1');
    });
  });

  describe('RolesGuard enforcement (reads: any authenticated user; writes: owner/admin)', () => {
    it('rejects an unauthenticated read with 401', async () => {
      await app.close();
      app = await buildApp(service, null, store);

      const response = await request(app.getHttpServer()).get('/products');
      expect(response.status).toBe(401);
    });

    it('admits a plain "user" caller on a read route', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.user, store);

      const response = await request(app.getHttpServer()).get('/products');
      expect(response.status).toBe(200);
    });

    it('rejects a plain "user" caller writing with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user, store);

      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1');
      expect(response.status).toBe(403);
    });

    it('admits an "owner" caller writing -> 200', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.owner, store);

      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1');
      expect(response.status).toBe(200);
    });
  });

  describe('POST /products/:id/image', () => {
    it('owner/admin uploads a valid JPEG within the size limit — succeeds, Product.image updated', async () => {
      service.findById.mockResolvedValue(sampleResponse);
      store.put.mockResolvedValue('products/11111111-1111-1111-1111-111111111111.webp');
      service.update.mockResolvedValue({
        ...sampleResponse,
        image: 'products/11111111-1111-1111-1111-111111111111.webp',
      });

      const response = await request(app.getHttpServer())
        .post('/products/product-uuid-1/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(200);
      expect(response.body.image).toBe('products/11111111-1111-1111-1111-111111111111.webp');
      // Tenant-scoped: the store receives the ACTING caller's companyId, never
      // a client-supplied one (spec: salesops-products, "Two companies'
      // uploads never share a path").
      expect(store.put).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'test-company-1', declaredMimeType: 'image/webp' }),
      );
      expect(service.update).toHaveBeenCalledWith('product-uuid-1', {
        image: 'products/11111111-1111-1111-1111-111111111111.webp',
      });
    });

    it('rejects a non-owner/admin role with 403, Product.image unchanged', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user, store);

      const response = await request(app.getHttpServer())
        .post('/products/product-uuid-1/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(403);
      expect(store.put).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('rejects an oversized file before any storage write', async () => {
      const oversized = Buffer.alloc(11 * 1024 * 1024, 0);

      const response = await request(app.getHttpServer())
        .post('/products/product-uuid-1/image')
        .attach('image', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(413);
      expect(store.put).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type, no file written to storage', async () => {
      const response = await request(app.getHttpServer())
        .post('/products/product-uuid-1/image')
        .attach('image', Buffer.from('%PDF-1.4 not really'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(400);
      expect(store.put).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the target product does not exist, before any storage write', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/products/unknown-id/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(404);
      expect(store.put).not.toHaveBeenCalled();
    });

    describe('security: stored extension derives from the VALIDATED content, never the client filename (D10)', () => {
      it('a hostile filename that disagrees with the real content is IGNORED — extension is the one the content earns', async () => {
        service.findById.mockResolvedValue(sampleResponse);
        store.put.mockResolvedValue('products/22222222-2222-2222-2222-222222222222.webp');
        service.update.mockResolvedValue({
          ...sampleResponse,
          image: 'products/22222222-2222-2222-2222-222222222222.webp',
        });

        // Filename lies twice over — claims `.jpg`, then `.svg` — but the
        // BYTES are a real, decodable PNG. `PutProductImageInput` has no
        // filename field at all (design.md D1), so the only way the stored
        // extension could ever reflect "payload.jpg.svg" is if some layer
        // read the filename — none does.
        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'payload.jpg.svg', contentType: 'image/png' });

        expect(response.status).toBe(200);
        // normalizeImage always re-encodes to webp (design.md D10 — "one
        // format = one extension"), so the earned extension is .webp, never
        // .svg, .jpg, or .png — proving content, not filename, decided it.
        expect(store.put).toHaveBeenCalledWith(
          expect.objectContaining({ declaredMimeType: 'image/webp' }),
        );
        expect(response.body.image).toBe('products/22222222-2222-2222-2222-222222222222.webp');
      });

      it('a filename claiming a real image extension but carrying non-image bytes is rejected by sharp — 400, never an uncaught rejection', async () => {
        service.findById.mockResolvedValue(sampleResponse);

        // Reverse of the case above: filename claims `.jpg` (and the
        // Content-Type header claims `image/jpeg`, passing the cheap pipe
        // filter), but the bytes decode to nothing. `normalizeImage`'s sharp
        // call is the ONLY layer that inspects real content (design.md
        // D10) — this must reject with a controlled 400, never crash the
        // process with an uncaught rejection.
        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', NOT_AN_IMAGE_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' });

        expect(response.status).toBe(400);
        expect(store.put).not.toHaveBeenCalled();
        expect(service.update).not.toHaveBeenCalled();
      });
    });
  });
});
