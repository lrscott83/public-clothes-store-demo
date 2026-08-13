import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '@store-mgmt/api-common';
import { IMAGE_STORE, InvalidCategoryError, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import {
  mockTenantContextService,
  overrideJwtAuth,
  overrideTenantContext,
} from '../test-support/auth-test-helpers.js';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

type CategoryServiceMock = {
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
 * filename is never consulted (`PutImageInput` has no filename field at
 * all).
 */
const REAL_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const sampleResponse = {
  id: 'category-uuid-1',
  name: 'Cafeteras',
  slug: 'cafeteras',
  image: null,
  icon: null,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Builds a test app with `JwtAuthGuard`/`TenantContextGuard` overridden to inject `req.user`/`req.tenant` (`roles: null` -> 401), keeping the REAL `RolesGuard`. */
async function buildApp(
  service: CategoryServiceMock,
  roles: number | null,
  store: ImageStoreMock,
): Promise<INestApplication> {
  const builder = overrideTenantContext(
    overrideJwtAuth(
      Test.createTestingModule({
        controllers: [CategoryController],
        providers: [
          { provide: CategoryService, useValue: service },
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

describe('CategoryController', () => {
  let app: INestApplication;
  let service: CategoryServiceMock;
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

  describe('POST /categories', () => {
    it('returns 201 with the created category', async () => {
      service.create.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(sampleResponse);
    });

    it('maps a duplicate-slug InvalidCategoryError to 400', async () => {
      service.create.mockRejectedValue(new InvalidCategoryError('Category slug "cafeteras" already exists'));

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /categories', () => {
    it('returns the active-only list by default', async () => {
      service.list.mockResolvedValue([sampleResponse]);

      const response = await request(app.getHttpServer()).get('/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([sampleResponse]);
      expect(service.list).toHaveBeenCalledWith(false);
    });
  });

  describe('GET /categories/:id', () => {
    it('returns 200 for a found category', async () => {
      service.findById.mockResolvedValue(sampleResponse);

      const response = await request(app.getHttpServer()).get('/categories/category-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleResponse);
    });

    it('returns 404 for an unknown id', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/categories/unknown-id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('returns 200 with the updated category', async () => {
      service.update.mockResolvedValue({ ...sampleResponse, name: 'Cafeteras Updated' });

      const response = await request(app.getHttpServer())
        .patch('/categories/category-uuid-1')
        .send({ name: 'Cafeteras Updated' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Cafeteras Updated');
    });
  });

  describe('DELETE /categories/:id', () => {
    it('soft-deletes and returns 200, never a hard delete', async () => {
      const response = await request(app.getHttpServer()).delete('/categories/category-uuid-1');

      expect(response.status).toBe(200);
      expect(service.softDelete).toHaveBeenCalledWith('category-uuid-1');
    });
  });

  describe('RolesGuard enforcement (reads: any authenticated user; writes: owner/admin)', () => {
    it('rejects an unauthenticated read with 401', async () => {
      await app.close();
      app = await buildApp(service, null, store);

      const response = await request(app.getHttpServer()).get('/categories');
      expect(response.status).toBe(401);
    });

    it('admits a plain "user" caller on a read route', async () => {
      await app.close();
      service.list.mockResolvedValue([sampleResponse]);
      app = await buildApp(service, USER_ROLES.user, store);

      const response = await request(app.getHttpServer()).get('/categories');
      expect(response.status).toBe(200);
    });

    it('rejects a plain "user" caller writing with 403', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user, store);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
      expect(response.status).toBe(403);
    });

    it('admits an "owner" caller writing -> 201', async () => {
      await app.close();
      service.create.mockResolvedValue(sampleResponse);
      app = await buildApp(service, USER_ROLES.owner, store);

      const response = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
      expect(response.status).toBe(201);
    });
  });

  describe('POST /categories/:id/image', () => {
    it('owner/admin uploads a valid PNG within the size limit — succeeds, Category.image updated', async () => {
      service.findById.mockResolvedValue(sampleResponse);
      store.put.mockResolvedValue('categories/11111111-1111-1111-1111-111111111111.webp');
      service.update.mockResolvedValue({
        ...sampleResponse,
        image: 'categories/11111111-1111-1111-1111-111111111111.webp',
      });

      const response = await request(app.getHttpServer())
        .post('/categories/category-uuid-1/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
      expect(response.body.image).toBe('categories/11111111-1111-1111-1111-111111111111.webp');
      expect(service.update).toHaveBeenCalledWith('category-uuid-1', {
        image: 'categories/11111111-1111-1111-1111-111111111111.webp',
      });
    });

    it('mints under the categories collection, not products', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: null });
      store.put.mockResolvedValue('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp');
      service.update.mockResolvedValue({
        ...sampleResponse,
        image: 'categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
      });

      const response = await request(app.getHttpServer())
        .post('/categories/category-uuid-1/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
      // Tenant-scoped: the store receives the ACTING caller's companyId, never
      // a client-supplied one (spec: salesops-products, "Two companies'
      // uploads never share a path").
      expect(store.put).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'categories', companyId: 'test-company-1' }),
      );
    });

    it('rejects a non-owner/admin role with 403, Category.image unchanged', async () => {
      await app.close();
      app = await buildApp(service, USER_ROLES.user, store);

      const response = await request(app.getHttpServer())
        .post('/categories/category-uuid-1/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

      expect(response.status).toBe(403);
      expect(store.put).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('rejects an oversized file before any storage write', async () => {
      const oversized = Buffer.alloc(11 * 1024 * 1024, 0);

      const response = await request(app.getHttpServer())
        .post('/categories/category-uuid-1/image')
        .attach('image', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(413);
      expect(store.put).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type, no file written to storage', async () => {
      const response = await request(app.getHttpServer())
        .post('/categories/category-uuid-1/image')
        .attach('image', Buffer.from('%PDF-1.4 not really'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(400);
      expect(store.put).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the target category does not exist, before any storage write', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/categories/unknown-id/image')
        .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

      expect(response.status).toBe(404);
      expect(store.put).not.toHaveBeenCalled();
    });

    describe('post-commit cleanup of the replaced image', () => {
      const OLD_UPLOADED_REF = 'categories/33333333-3333-3333-3333-333333333333.webp';
      const NEW_REF = 'categories/44444444-4444-4444-4444-444444444444.webp';

      function arrangeReupload(previousImage: string): void {
        service.findById.mockResolvedValue({ ...sampleResponse, image: previousImage });
        store.put.mockResolvedValue(NEW_REF);
        service.update.mockResolvedValue({ ...sampleResponse, image: NEW_REF });
      }

      it('deletes the previously-uploaded file, and only AFTER the DB update commits', async () => {
        const previous = 'categories/11111111-1111-1111-1111-111111111111.webp';
        arrangeReupload(previous);
        const calls: string[] = [];
        service.update.mockImplementation(async () => {
          calls.push('update');
          return { ...sampleResponse, image: 'categories/22222222-2222-2222-2222-222222222222.webp' };
        });
        store.put.mockResolvedValue('categories/22222222-2222-2222-2222-222222222222.webp');
        store.delete.mockImplementation(async () => {
          calls.push('delete');
        });

        const response = await request(app.getHttpServer())
          .post('/categories/category-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(calls).toEqual(['update', 'delete']);
        expect(store.delete).toHaveBeenCalledWith('test-company-1', previous);
      });

      it.each([
        ['a seeded catalog ref', 'categories/cafeteras/cafeteras1.jpeg'],
        ['an absolute URL left by older data', 'https://example.com/cafeteras.png'],
        ['an empty image (first upload ever)', ''],
      ])('never deletes %s — the store removes only refs the store itself minted', async (_label, previousImage) => {
        arrangeReupload(previousImage);

        const response = await request(app.getHttpServer())
          .post('/categories/category-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(store.delete).not.toHaveBeenCalled();
      });

      it('a failing cleanup never turns a successful upload into an error', async () => {
        arrangeReupload(OLD_UPLOADED_REF);
        store.delete.mockRejectedValue(new Error('EACCES: permission denied'));

        const response = await request(app.getHttpServer())
          .post('/categories/category-uuid-1/image')
          .attach('image', REAL_PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(response.body.image).toBe(NEW_REF);
      });
    });
  });

  describe('GET /categories/:id/image', () => {
    const IMAGE_REF = 'categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp';

    it('serves the bytes of an INACTIVE category — the public endpoint will not', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, active: false, image: IMAGE_REF });
      store.open.mockResolvedValue({
        stream: Readable.from([Buffer.from([1, 2, 3])]),
        contentType: 'image/webp',
        byteLength: 3,
      });

      const response = await request(app.getHttpServer()).get('/categories/category-uuid-1/image');

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

      const response = await request(app.getHttpServer()).get('/categories/category-uuid-1/image');

      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('404s when the category has no image', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: null });

      const response = await request(app.getHttpServer()).get('/categories/category-uuid-1/image');

      expect(response.status).toBe(404);
      expect(store.open).not.toHaveBeenCalled();
    });

    it('404s when the row points at bytes that are gone', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: IMAGE_REF });
      store.open.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/categories/category-uuid-1/image');

      expect(response.status).toBe(404);
    });

    it('returns 404 for an unknown category, before opening the store', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/categories/unknown-id/image');

      expect(response.status).toBe(404);
      expect(store.open).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /categories/:id/image', () => {
    const MINTED_REF = 'categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp';

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

      const response = await request(app.getHttpServer()).delete('/categories/category-uuid-1/image');

      expect(response.status).toBe(200);
      expect(response.body.image).toBeNull();
      expect(service.update).toHaveBeenCalledWith('category-uuid-1', { image: null });
      expect(store.delete).toHaveBeenCalledWith('test-company-1', MINTED_REF);
      expect(callOrder).toEqual(['update', 'delete']);
    });

    it('never deletes a seeded ref the store did not mint', async () => {
      service.findById.mockResolvedValue({
        ...sampleResponse,
        image: 'categories/cafeteras/cafeteras1.jpeg',
      });
      service.update.mockResolvedValue({ ...sampleResponse, image: null });

      const response = await request(app.getHttpServer()).delete('/categories/category-uuid-1/image');

      expect(response.status).toBe(200);
      expect(service.update).toHaveBeenCalledWith('category-uuid-1', { image: null });
      expect(store.delete).not.toHaveBeenCalled();
    });

    it('succeeds when cleanup fails — the row is already updated', async () => {
      service.findById.mockResolvedValue({ ...sampleResponse, image: MINTED_REF });
      service.update.mockResolvedValue({ ...sampleResponse, image: null });
      store.delete.mockRejectedValue(new Error('EACCES'));

      const response = await request(app.getHttpServer()).delete('/categories/category-uuid-1/image');

      expect(response.status).toBe(200);
      expect(response.body.image).toBeNull();
    });

    it('404s for a category that does not exist', async () => {
      service.findById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).delete('/categories/nope/image');

      expect(response.status).toBe(404);
    });
  });
});
