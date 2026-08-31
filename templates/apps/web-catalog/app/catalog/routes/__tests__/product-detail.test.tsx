import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProductDetailPage } from '../product-detail';
import { defaultStoreConfig } from '../../../shared/config/stores/default.config';
import type { PublicProductDto } from '../../../shared/lib/public-api.types';

const PRODUCT: PublicProductDto = {
  id: 'product-1',
  name: 'Remera Oversize',
  description: 'Remera de algodón 100%.',
  categoryId: 'cat-1',
  categorySlug: 'remeras',
  price: { amount: '100.00', currency: 'USD' },
  finalPrice: { amount: '75.00', currency: 'USD' },
  percentDiscountPrice: '20.00',
  discountPrice: '5.00',
  isOffer: true,
  isNew: true,
  imageUrl: 'http://localhost:3003/public/products/product-1/image/abc.webp',
  order: 1,
};

function renderDetail(product: PublicProductDto | null) {
  return render(
    <MemoryRouter>
      <ProductDetailPage config={{ ...defaultStoreConfig, locale: 'en-US' }} product={product} />
    </MemoryRouter>,
  );
}

describe('ProductDetailPage', () => {
  it('renders the product name, description, image and badges', () => {
    renderDetail(PRODUCT);

    expect(screen.getByText(PRODUCT.name)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT.description)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: PRODUCT.name })).toHaveAttribute('src', PRODUCT.imageUrl);
    expect(screen.getByTestId('product-badge-new')).toBeInTheDocument();
    expect(screen.getByTestId('product-badge-percent')).toHaveTextContent('-20%');
    expect(screen.getByTestId('product-badge-discount')).toHaveTextContent('-5,00 USD');
  });

  it('shows finalPrice in accent + the struck-through original price when isOffer', () => {
    renderDetail(PRODUCT);

    expect(screen.getByText('75,00 USD')).toBeInTheDocument();
    expect(screen.getByTestId('product-detail-original-price')).toHaveTextContent('100,00 USD');
  });

  it('degrades gracefully for an unknown id — renders a friendly message, never crashes', () => {
    renderDetail(null);

    expect(screen.getByText('Producto no encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
