import { Test, TestingModule } from '@nestjs/testing';
import type {
  Category as DomainCategory,
  ICategoryRepository,
  IProductRepository,
  Product as DomainProduct,
} from '@store-mgmt/domain';
import { CATEGORY_REPOSITORY, InvalidProductError, PRODUCT_REPOSITORY, money } from '@store-mgmt/domain';
import { ProductService } from './product.service.js';

function buildProductRepoMock(): jest.Mocked<IProductRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  };
}

function buildCategoryRepoMock(): jest.Mocked<ICategoryRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    list: jest.fn(),
  };
}

const sampleCategory: DomainCategory = {
  id: 'category-uuid-1',
  name: 'Cafeteras',
  slug: 'cafeteras',
  order: 1,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const sampleProduct: DomainProduct = {
  id: 'product-uuid-1',
  name: 'Cafetera Express',
  description: 'Cafetera express de 15 bares.',
  sku: undefined,
  barcode: undefined,
  price: money(10000n, 'USD'),
  percentDiscountPrice: 2000n,
  discountPrice: money(500n, 'USD'),
  costoUSD: money(6000n, 'USD'),
  categoryId: 'category-uuid-1',
  image: 'https://example.com/cafetera.png',
  isNew: false,
  order: 1,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ProductService', () => {
  let service: ProductService;
  let productRepo: jest.Mocked<IProductRepository>;
  let categoryRepo: jest.Mocked<ICategoryRepository>;

  beforeEach(async () => {
    productRepo = buildProductRepoMock();
    categoryRepo = buildCategoryRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PRODUCT_REPOSITORY, useValue: productRepo },
        { provide: CATEGORY_REPOSITORY, useValue: categoryRepo },
      ],
    }).compile();
    service = module.get(ProductService);
  });

  describe('create', () => {
    it('maps decimal strings to domain Money/percent and includes derived finalPrice/isOffer on the response', async () => {
      categoryRepo.findById.mockResolvedValue(sampleCategory);
      productRepo.create.mockResolvedValue(sampleProduct);

      const result = await service.create({
        name: 'Cafetera Express',
        description: 'Cafetera express de 15 bares.',
        price: '100.00',
        percentDiscountPrice: '20.00',
        discountPrice: '5.00',
        costoUSD: '60.00',
        categoryId: 'category-uuid-1',
        image: 'https://example.com/cafetera.png',
        order: 1,
      });

      expect(result.price).toBe('100.00');
      expect(result.percentDiscountPrice).toBe('20.00');
      expect(result.discountPrice).toBe('5.00');
      expect(result.costoUSD).toBe('60.00');
      // finalPrice = 100 - 20 - 5 = 75.00
      expect(result.finalPrice).toBe('75.00');
      expect(result.isOffer).toBe(true);
      expect(result.sku).toBeNull();
    });

    it('rejects creation with a missing/nonexistent categoryId — never a silent 500', async () => {
      categoryRepo.findById.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Cafetera Express',
          description: 'x',
          price: '100.00',
          costoUSD: '60.00',
          categoryId: 'does-not-exist',
          image: 'https://example.com/cafetera.png',
          order: 1,
        }),
      ).rejects.toBeInstanceOf(InvalidProductError);
      expect(productRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('includes finalPrice/isOffer on the read response', async () => {
      productRepo.findById.mockResolvedValue(sampleProduct);

      const result = await service.findById('product-uuid-1');

      expect(result?.finalPrice).toBe('75.00');
      expect(result?.isOffer).toBe(true);
    });
  });

  describe('list', () => {
    it('includes finalPrice/isOffer on every item', async () => {
      productRepo.list.mockResolvedValue([sampleProduct]);

      const result = await service.list();

      expect(result[0]?.finalPrice).toBe('75.00');
    });
  });

  describe('softDelete', () => {
    it('delegates to the repository without exposing a hard-delete path', async () => {
      await service.softDelete('product-uuid-1');
      expect(productRepo.softDelete).toHaveBeenCalledWith('product-uuid-1');
    });
  });
});
