import type { Product } from '@store-mgmt/domain';
import { toPublicProductDto } from './to-public-product-dto.js';

const baseProduct: Product = {
  id: 'product-uuid-1',
  name: 'Cafetera Express',
  description: 'Cafetera express de 15 bares.',
  sku: 'SKU-001',
  barcode: '7791234567890',
  price: { minorUnits: 10000n, currency: 'USD' },
  percentDiscountPrice: 0n,
  discountPrice: 0n,
  cost: { minorUnits: 6000n, currency: 'USD' },
  categoryId: 'category-uuid-1',
  image: 'products/abc123.webp',
  isNew: false,
  order: 1,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('toPublicProductDto', () => {
  it('returns a null imageUrl for a product with no image', () => {
    const dto = toPublicProductDto(
      { product: { ...baseProduct, image: null }, finalPrice: baseProduct.price },
      'remeras',
    );

    expect(dto.imageUrl).toBeNull();
  });

  it('still assembles a URL when the product has an image', () => {
    const dto = toPublicProductDto(
      { product: { ...baseProduct, image: 'products/x.webp' }, finalPrice: baseProduct.price },
      'remeras',
    );

    expect(dto.imageUrl).toContain(`/public/products/${baseProduct.id}/image/`);
  });
});
