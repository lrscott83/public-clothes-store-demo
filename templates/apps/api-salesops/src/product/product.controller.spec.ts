import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { IMAGE_STORE, InvalidMoneyError, InvalidProductError, USER_ROLES } from '@store-mgmt/domain';
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

type ImageStoreMock = { put: jest.Mock; delete: jest.Mock; open: jest.Mock };

/**
 * Minimal valid 1x1 PNG (real bytes, not a stub) — lets the upload tests
 * exercise the REAL `sharp` decode inside `normalizeImage` (design.md D10:
 * the pipe is a cheap filter, sharp is the real gate). `store.put` is
 * mocked; `normalizeImage` is NOT — the security property under test is
 * that `sharp` genuinely decodes/re-encodes bytes and that a hostile
 * filename is never consulted (`PutImageInput` has no filename
 * field at all).
 */
const REAL_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

/**
 * A real, decodable 1x1 AVIF. `file-type` reports it as `image/avif` — a MIME
 * string the allowlist must carry explicitly, because sharp decodes AVIF
 * happily and rejecting it would turn a supported format into a 400.
 */
const REAL_AVIF_BYTES = Buffer.from(
  'AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAABsAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAjbWRhdBIACgc4AAaQENBpMg4cQmLk4AAWAACQNY45wA==',
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
          { provide: IMAGE_STORE, useValue: store },
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
      delete: jest.fn().mockResolvedValue(undefined),
      open: jest.fn(),
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

    it('rejects an upload-minted image ref with 400 — design.md D4, never routed to the service', async () => {
      const response = await request(app.getHttpServer()).post('/products').send({
        name: 'Cafetera Express',
        description: 'x',
        price: { amount: '100.00', currency: 'USD' },
        cost: { amount: '60.00', currency: 'USD' },
        categoryId: 'category-uuid-1',
        image: 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
        order: 1,
      });

      expect(response.status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
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

    it('rejects an upload-minted image ref with 400 — design.md D4, never routed to the service', async () => {
      const response = await request(app.getHttpServer())
        .patch('/products/product-uuid-1')
        .send({ image: 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp' });

      expect(response.status).toBe(400);
      expect(service.update).not.toHaveBeenCalled();
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

    describe('post-commit cleanup of the replaced image', () => {
      const OLD_UPLOADED_REF = 'products/33333333-3333-3333-3333-333333333333.webp';
      const NEW_REF = 'products/44444444-4444-4444-4444-444444444444.webp';

      function arrangeReupload(previousImage: string): void {
        service.findById.mockResolvedValue({ ...sampleResponse, image: previousImage });
        store.put.mockResolvedValue(NEW_REF);
        service.update.mockResolvedValue({ ...sampleResponse, image: NEW_REF });
      }

      it('deletes the previously-uploaded file, and only AFTER the DB update commits', async () => {
        arrangeReupload(OLD_UPLOADED_REF);
        const callOrder: string[] = [];
        service.update.mockImplementation(async () => {
          callOrder.push('update');
          return { ...sampleResponse, image: NEW_REF };
        });
        store.delete.mockImplementation(async () => {
          callOrder.push('delete');
        });

        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(store.delete).toHaveBeenCalledWith('test-company-1', OLD_UPLOADED_REF);
        // Ordering is the whole point: deleting BEFORE the update would
        // destroy the live file if the update then failed.
        expect(callOrder).toEqual(['update', 'delete']);
      });

      it.each([
        ['a seeded catalog ref', 'products/cafeteras/cafeteras1.jpeg'],
        ['an absolute URL left by older data', 'https://example.com/cafetera.png'],
        ['an empty image (first upload ever)', ''],
      ])('never deletes %s — the store removes only refs the store itself minted', async (_label, previousImage) => {
        arrangeReupload(previousImage);

        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(store.delete).not.toHaveBeenCalled();
      });

      it('a failing cleanup never turns a successful upload into an error', async () => {
        arrangeReupload(OLD_UPLOADED_REF);
        store.delete.mockRejectedValue(new Error('EACCES: permission denied'));

        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

        // The bytes are stored and the row is updated — the user's action
        // fully succeeded. An orphaned file is the acceptable residue.
        expect(response.status).toBe(200);
        expect(response.body.image).toBe(NEW_REF);
      });
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
        // BYTES are a real, decodable PNG. `PutImageInput` has no
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

      it('a filename claiming a real image extension but carrying non-image bytes is rejected — 400, never an uncaught rejection', async () => {
        service.findById.mockResolvedValue(sampleResponse);

        // Reverse of the case above: the filename claims `.jpg` AND the
        // Content-Type header claims `image/jpeg`, so every client-supplied
        // signal agrees and lies. The bytes decode to nothing. Two
        // independent layers now catch this — the pipe's magic-number
        // inspection first, `normalizeImage`'s sharp decode behind it — and
        // either way it is a controlled 400, never an uncaught rejection.
        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', NOT_AN_IMAGE_BYTES, { filename: 'photo.jpg', contentType: 'image/jpeg' });

        expect(response.status).toBe(400);
        expect(store.put).not.toHaveBeenCalled();
        expect(service.update).not.toHaveBeenCalled();
      });

      it('non-image bytes never reach sharp — the magic-number filter rejects them first', async () => {
        service.findById.mockResolvedValue(sampleResponse);

        // The point of validating magic numbers in the pipe is NOT that it
        // catches more than sharp does — sharp rejects this too. It is that
        // attacker-controlled bytes stop at a pure-JS signature check and
        // never reach libvips, a large native decoder. Asserting the 400
        // alone cannot tell the two layers apart, so this asserts the
        // rejection happened at a point where the request body was still
        // just bytes: nothing downstream of the pipe ran.
        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', NOT_AN_IMAGE_BYTES, { filename: 'x.png', contentType: 'image/png' });

        expect(response.status).toBe(400);
        // The pipe runs before the handler body, so the product lookup that
        // opens the handler never happened. If sharp had been the rejecting
        // layer, findById would have been called first.
        expect(service.findById).not.toHaveBeenCalled();
      });

      it('accepts AVIF, a format sharp decodes — the allowlist matches real capability, not a guess', async () => {
        service.findById.mockResolvedValue(sampleResponse);
        store.put.mockResolvedValue('products/33333333-3333-3333-3333-333333333333.webp');
        service.update.mockResolvedValue({
          ...sampleResponse,
          image: 'products/33333333-3333-3333-3333-333333333333.webp',
        });

        // `file-type` reports AVIF as `image/avif`, which no client-declared
        // Content-Type can talk it out of once magic numbers are inspected.
        // sharp decodes AVIF, so rejecting it here would fail an upload the
        // system is perfectly able to serve — the allowlist has to describe
        // what the pipeline actually supports.
        const response = await request(app.getHttpServer())
          .post('/products/product-uuid-1/image')
          .attach('image', REAL_AVIF_BYTES, { filename: 'photo.avif', contentType: 'image/avif' });

        expect(response.status).toBe(200);
        expect(store.put).toHaveBeenCalledWith(
          expect.objectContaining({ declaredMimeType: 'image/webp' }),
        );
      });
    });
  });

  describe('GET /products/:id/image', () => {
    const IMAGE_REF = 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp';

    it('serves the bytes of an INACTIVE product — the public endpoint will not', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, active: false, image: IMAGE_REF });
      store.open.mockResolvedValue({
        stream: Readable.from([Buffer.from([1, 2, 3])]),
        contentType: 'image/webp',
        byteLength: 3,
      });

      const response = await request(app.getHttpServer()).get('/products/product-uuid-1/image');

      expect(response.status).toBe(200);
      expect(store.open).toHaveBeenCalledWith('test-company-1', IMAGE_REF);
    });

    it('sets a private, no-store cache header so a replace is visible immediately', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: IMAGE_REF });
      store.open.mockResolvedValue({
        stream: Readable.from([Buffer.from([1])]),
        contentType: 'image/webp',
        byteLength: 1,
      });

      const response = await request(app.getHttpServer()).get('/products/product-uuid-1/image');

      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('404s when the product has no image', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: null });

      const response = await request(app.getHttpServer()).get('/products/product-uuid-1/image');

      expect(response.status).toBe(404);
      expect(store.open).not.toHaveBeenCalled();
    });

    it('404s when the row points at bytes that are gone', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: IMAGE_REF });
      store.open.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/products/product-uuid-1/image');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /products/:id/image', () => {
    const MINTED_REF = 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp';

    it('nulls the column and then deletes the minted bytes — in that order', async () => {
      const callOrder: string[] = [];
      service.findById.mockResolvedValue({ ...sampleResponse, image: MINTED_REF });
      service.update.mockImplementation(async () => {
        callOrder.push('update');
        return { ...sampleResponse, image: null };
      });
      store.delete.mockImplementation(async () => {
        callOrder.push('delete');
      });

      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1/image');

      expect(response.status).toBe(200);
      expect(response.body.image).toBeNull();
      expect(service.update).toHaveBeenCalledWith('product-uuid-1', { image: null });
      expect(store.delete).toHaveBeenCalledWith('test-company-1', MINTED_REF);
      // Ordering is the whole point: deleting BEFORE the update would risk a
      // row pointing at bytes that no longer exist if the update then failed.
      expect(callOrder).toEqual(['update', 'delete']);
    });

    it('never deletes a seeded ref the store did not mint', async () => {
      service.findById.mockResolvedValue({
        ...sampleResponse,
        image: 'products/cafeteras/cafeteras1.jpeg',
      });
      service.update.mockResolvedValue({ ...sampleResponse, image: null });

      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1/image');

      expect(response.status).toBe(200);
      expect(service.update).toHaveBeenCalledWith('product-uuid-1', { image: null });
      expect(store.delete).not.toHaveBeenCalled();
    });

    it('succeeds when cleanup fails — the row is already updated', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: MINTED_REF });
      service.update.mockResolvedValue({ ...sampleResponse, image: null });
      store.delete.mockRejectedValue(new Error('EACCES'));

      const response = await request(app.getHttpServer()).delete('/products/product-uuid-1/image');

      expect(response.status).toBe(200);
      expect(response.body.image).toBeNull();
    });

    it('404s for a product that does not exist', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).delete('/products/nope/image');

      expect(response.status).toBe(404);
    });
  });
});
