import type { Category, ICategoryRepository, IProductRepository, Product } from '@store-mgmt/domain';
import { moneyFromDecimalString } from '@store-mgmt/domain';
import { PublicProductService } from './public-product.service.js';

type ProductRepositoryMock = { list: jest.Mock };
type CategoryRepositoryMock = { findBySlug: jest.Mock };

function buildProduct(overrides: Partial<Product>): Product {
  return {
    id: 'product-uuid-default',
    name: 'Producto',
    description: 'Descripción',
    price: moneyFromDecimalString('10.00', 'USD'),
    percentDiscountPrice: 0n,
    discountPrice: 0n,
    cost: moneyFromDecimalString('5.00', 'USD'),
    categoryId: 'category-uuid-1',
    image: 'products/placeholder.webp',
    isNew: false,
    order: 1,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildService(products: Product[]): {
  service: PublicProductService;
  productRepository: ProductRepositoryMock;
  categoryRepository: CategoryRepositoryMock;
} {
  const productRepository: ProductRepositoryMock = { list: jest.fn().mockResolvedValue(products) };
  const categoryRepository: CategoryRepositoryMock = { findBySlug: jest.fn() };
  const service = new PublicProductService(
    productRepository as unknown as IProductRepository,
    categoryRepository as unknown as ICategoryRepository,
  );
  return { service, productRepository, categoryRepository };
}

describe('PublicProductService', () => {
  describe('sort-then-paginate correctness', () => {
    it('sorts by finalPrice, not by Product.order, when orden=precio-asc — a fixture where the two disagree', async () => {
      // X: order=5 (last in featured order), price 100.00 with 50% off -> finalPrice 50.00
      // Y: order=1 (first in featured order), price 60.00, no discount -> finalPrice 60.00
      // Featured order would rank Y before X. Price-ascending must rank X before Y —
      // proving finalPrice actually drives the sort, not Product.order.
      const x = buildProduct({
        id: 'product-x',
        order: 5,
        price: moneyFromDecimalString('100.00', 'USD'),
        percentDiscountPrice: 5000n, // 50.00%
      });
      const y = buildProduct({
        id: 'product-y',
        order: 1,
        price: moneyFromDecimalString('60.00', 'USD'),
      });
      const { service } = buildService([x, y]);

      const result = await service.list({ sort: 'precio-asc', page: 1, pageSize: 12 });

      expect(result.items.map((item) => item.product.id)).toEqual(['product-x', 'product-y']);
      expect(result.items[0].finalPrice.minorUnits).toBe(5000n); // 50.00
      expect(result.items[1].finalPrice.minorUnits).toBe(6000n); // 60.00
    });

    it('sorts by finalPrice descending when orden=precio-desc', async () => {
      const cheap = buildProduct({ id: 'cheap', price: moneyFromDecimalString('10.00', 'USD') });
      const expensive = buildProduct({ id: 'expensive', price: moneyFromDecimalString('90.00', 'USD') });
      const { service } = buildService([cheap, expensive]);

      const result = await service.list({ sort: 'precio-desc', page: 1, pageSize: 12 });

      expect(result.items.map((item) => item.product.id)).toEqual(['expensive', 'cheap']);
    });

    it('defaults to Product.order ascending for orden=destacado', async () => {
      const second = buildProduct({ id: 'second', order: 2 });
      const first = buildProduct({ id: 'first', order: 1 });
      const { service } = buildService([second, first]);

      const result = await service.list({ sort: 'destacado', page: 1, pageSize: 12 });

      expect(result.items.map((item) => item.product.id)).toEqual(['first', 'second']);
    });
  });

  describe('page boundaries and total vs page length', () => {
    it('13 products sorted price-ascending, pageSize 12: page 2 has exactly the 13th-ranked product, total stays 13', async () => {
      const products = Array.from({ length: 13 }, (_, index) =>
        buildProduct({
          id: `product-${index + 1}`,
          // Ascending price: product-1 is cheapest, product-13 is priciest.
          price: moneyFromDecimalString(`${10 + index}.00`, 'USD'),
        }),
      );
      const { service } = buildService(products);

      const page1 = await service.list({ sort: 'precio-asc', page: 1, pageSize: 12 });
      const page2 = await service.list({ sort: 'precio-asc', page: 2, pageSize: 12 });

      expect(page1.items).toHaveLength(12);
      expect(page1.total).toBe(13);
      expect(page1.pageCount).toBe(2);

      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].product.id).toBe('product-13');
      expect(page2.total).toBe(13);
      expect(page2.pageCount).toBe(2);
    });

    it('a page beyond the end returns an empty items array with total still exact', async () => {
      const products = [buildProduct({ id: 'only-one' })];
      const { service } = buildService(products);

      const result = await service.list({ sort: 'destacado', page: 5, pageSize: 12 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(1);
    });
  });

  describe('server-side filtering', () => {
    it('passes categoryId (resolved from categorySlug) and search through to the repository, never active:false', async () => {
      const { service, productRepository, categoryRepository } = buildService([]);
      categoryRepository.findBySlug.mockResolvedValue({ id: 'category-uuid-9' } as Category);

      await service.list({ categorySlug: 'cafeteras', search: 'azul', sort: 'destacado', page: 1, pageSize: 12 });

      expect(categoryRepository.findBySlug).toHaveBeenCalledWith('cafeteras');
      expect(productRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'category-uuid-9', search: 'azul' }),
      );
      const passedFilter = productRepository.list.mock.calls[0][0];
      expect(passedFilter.includeInactive).not.toBe(true);
    });

    it('an unknown category slug resolves to an empty page, never throws, and never queries the product repository', async () => {
      const { service, categoryRepository, productRepository } = buildService([buildProduct({ id: 'irrelevant' })]);
      categoryRepository.findBySlug.mockResolvedValue(null);

      const result = await service.list({ categorySlug: 'no-such-category', sort: 'destacado', page: 1, pageSize: 12 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(productRepository.list).not.toHaveBeenCalled();
    });
  });
});
