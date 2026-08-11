import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CATEGORY_REPOSITORY } from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import request from 'supertest';
import { mockTenantContextService, overridePublicTenant } from '../test-support/tenant-test-helpers.js';
import { PublicProductController } from './public-product.controller.js';
import { PublicProductService } from './public-product.service.js';

type PublicProductServiceMock = { list: jest.Mock; findActiveById: jest.Mock };
type CategoryRepositoryMock = { list: jest.Mock; findById: jest.Mock };

const CATEGORY = {
  id: 'category-uuid-1',
  name: 'Cafeteras',
  slug: 'cafeteras',
  image: null,
  icon: null,
  order: 1,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * `sku`/`barcode`/`cost` are deliberately non-null here — the DTO contract
 * test (design.md §3) must prove those keys are absent BECAUSE the mapper
 * never copies them, not merely because this fixture happened to leave them
 * empty (spec: public-catalog "cost/sku/barcode absent even when set").
 */
function buildProductItem(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      id: 'product-uuid-1',
      name: 'Cafetera Express',
      description: 'Cafetera express de 15 bares.',
      sku: 'SKU-001',
      barcode: '7791234567890',
      price: { minorUnits: 10000n, currency: 'USD' },
      percentDiscountPrice: 2000n,
      discountPrice: 500n,
      cost: { minorUnits: 6000n, currency: 'USD' },
      categoryId: CATEGORY.id,
      image: 'products/abc123.webp',
      isNew: false,
      order: 1,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    finalPrice: { minorUnits: 7500n, currency: 'USD' },
    ...overrides,
  };
}

async function buildApp(
  service: PublicProductServiceMock,
  categoryRepository: CategoryRepositoryMock,
): Promise<INestApplication> {
  const builder = overridePublicTenant(
    Test.createTestingModule({
      controllers: [PublicProductController],
      providers: [
        { provide: PublicProductService, useValue: service },
        { provide: CATEGORY_REPOSITORY, useValue: categoryRepository },
        { provide: TenantContextService, useValue: mockTenantContextService() },
      ],
    }),
  );
  const module: TestingModule = await builder.compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('PublicProductController', () => {
  let app: INestApplication;
  let service: PublicProductServiceMock;
  let categoryRepository: CategoryRepositoryMock;

  beforeEach(async () => {
    service = { list: jest.fn(), findActiveById: jest.fn() };
    categoryRepository = {
      list: jest.fn().mockResolvedValue([CATEGORY]),
      findById: jest.fn().mockResolvedValue(CATEGORY),
    };
    app = await buildApp(service, categoryRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('DTO contract (design.md §3)', () => {
    const ALLOWED_KEYS = [
      'categoryId',
      'categorySlug',
      'description',
      'discountPrice',
      'finalPrice',
      'id',
      'imageUrl',
      'isNew',
      'isOffer',
      'name',
      'order',
      'percentDiscountPrice',
      'price',
    ].sort();

    it('the response item key set equals EXACTLY the §3 allow-list — a key-set assertion, not a list of not.toHaveProperty', async () => {
      service.list.mockResolvedValue({
        items: [buildProductItem()],
        page: 1,
        pageSize: 12,
        total: 1,
        pageCount: 1,
      });

      const response = await request(app.getHttpServer()).get('/public/products');

      expect(response.status).toBe(200);
      const item = response.body.items[0];
      expect(Object.keys(item).sort()).toEqual(ALLOWED_KEYS);
    });

    it('percentDiscountPrice, discountPrice, and both Money amounts are decimal STRINGS — a JSON number is a FAILURE', async () => {
      service.list.mockResolvedValue({
        items: [buildProductItem()],
        page: 1,
        pageSize: 12,
        total: 1,
        pageCount: 1,
      });

      const response = await request(app.getHttpServer()).get('/public/products');
      const item = response.body.items[0];

      expect(typeof item.percentDiscountPrice).toBe('string');
      expect(item.percentDiscountPrice).toBe('20.00');
      expect(typeof item.discountPrice).toBe('string');
      expect(item.discountPrice).toBe('5.00');
      expect(typeof item.price.amount).toBe('string');
      expect(item.price.amount).toBe('100.00');
      expect(typeof item.finalPrice.amount).toBe('string');
      expect(item.finalPrice.amount).toBe('75.00');
      // Every other field's declared wire type (design.md §3 table).
      expect(typeof item.id).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.categoryId).toBe('string');
      expect(typeof item.categorySlug).toBe('string');
      expect(typeof item.price.currency).toBe('string');
      expect(typeof item.finalPrice.currency).toBe('string');
      expect(typeof item.isOffer).toBe('boolean');
      expect(typeof item.isNew).toBe('boolean');
      expect(typeof item.imageUrl).toBe('string');
      expect(typeof item.order).toBe('number');
    });

    it('a product with non-null cost/sku/barcode never surfaces those keys — absent by construction, not by omission', async () => {
      service.list.mockResolvedValue({
        items: [buildProductItem()],
        page: 1,
        pageSize: 12,
        total: 1,
        pageCount: 1,
      });

      const response = await request(app.getHttpServer()).get('/public/products');
      const item = response.body.items[0];

      expect('cost' in item).toBe(false);
      expect('sku' in item).toBe(false);
      expect('barcode' in item).toBe(false);
      expect('active' in item).toBe(false);
      expect('createdAt' in item).toBe(false);
      expect('updatedAt' in item).toBe(false);
    });

    it('both discount mechanisms travel independently, never collapsed into one field', async () => {
      service.list.mockResolvedValue({
        items: [buildProductItem()],
        page: 1,
        pageSize: 12,
        total: 1,
        pageCount: 1,
      });

      const response = await request(app.getHttpServer()).get('/public/products');
      const item = response.body.items[0];

      expect(item.percentDiscountPrice).toBe('20.00');
      expect(item.discountPrice).toBe('5.00');
    });
  });

  describe('GET /public/products', () => {
    it('forwards q/categoria/orden/pagina/porPagina to the service verbatim', async () => {
      service.list.mockResolvedValue({ items: [], page: 2, pageSize: 24, total: 0, pageCount: 1 });

      await request(app.getHttpServer())
        .get('/public/products')
        .query({ q: 'azul', categoria: 'cafeteras', orden: 'precio-asc', pagina: '2', porPagina: '24' });

      expect(service.list).toHaveBeenCalledWith({
        categorySlug: 'cafeteras',
        search: 'azul',
        sort: 'precio-asc',
        page: 2,
        pageSize: 24,
      });
    });

    it('defaults orden=destacado, pagina=1, porPagina=12 when absent', async () => {
      service.list.mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0, pageCount: 1 });

      await request(app.getHttpServer()).get('/public/products');

      expect(service.list).toHaveBeenCalledWith({
        categorySlug: undefined,
        search: undefined,
        sort: 'destacado',
        page: 1,
        pageSize: 12,
      });
    });

    it('rejects an unknown orden with 400 — it is our own URL, a typo is a bug', async () => {
      const response = await request(app.getHttpServer()).get('/public/products').query({ orden: 'barato' });
      expect(response.status).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    });

    it('rejects an unknown porPagina with 400', async () => {
      const response = await request(app.getHttpServer()).get('/public/products').query({ porPagina: '13' });
      expect(response.status).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    });

    it('a page number beyond the end never 400s — only the enum params (orden/porPagina) are strict', async () => {
      service.list.mockResolvedValue({ items: [], page: 999, pageSize: 12, total: 3, pageCount: 1 });
      const response = await request(app.getHttpServer()).get('/public/products').query({ pagina: '999' });
      expect(response.status).toBe(200);
    });

    it('resolves categorySlug for each item from the tenant category list, not a hardcoded value', async () => {
      const secondCategory = { ...CATEGORY, id: 'category-uuid-2', slug: 'remeras' };
      categoryRepository.list.mockResolvedValue([CATEGORY, secondCategory]);
      service.list.mockResolvedValue({
        items: [
          buildProductItem({ product: { ...buildProductItem().product, categoryId: 'category-uuid-2' } }),
        ],
        page: 1,
        pageSize: 12,
        total: 1,
        pageCount: 1,
      });

      const response = await request(app.getHttpServer()).get('/public/products');

      expect(response.body.items[0].categorySlug).toBe('remeras');
    });
  });

  describe('GET /public/products/:id', () => {
    it('returns the DTO for an active product', async () => {
      service.findActiveById.mockResolvedValue(buildProductItem());

      const response = await request(app.getHttpServer()).get('/public/products/product-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('product-uuid-1');
      expect(response.body.categorySlug).toBe('cafeteras');
    });

    it('returns 404 for an inactive or missing product — the service already excludes them', async () => {
      service.findActiveById.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/public/products/does-not-exist');

      expect(response.status).toBe(404);
    });
  });
});
