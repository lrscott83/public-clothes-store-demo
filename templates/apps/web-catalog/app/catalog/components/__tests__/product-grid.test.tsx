import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProductGrid } from '../product-grid';
import type { PublicProductDto } from '../../../shared/lib/public-api.types';

const ITEM: PublicProductDto = {
  id: 'product-1',
  name: 'Remera Oversize',
  description: 'Remera de algodón 100%.',
  categoryId: 'category-1',
  categorySlug: 'remeras',
  price: { amount: '100.00', currency: 'USD' },
  finalPrice: { amount: '100.00', currency: 'USD' },
  percentDiscountPrice: '0.00',
  discountPrice: '0.00',
  isOffer: false,
  isNew: false,
  imageUrl: 'http://localhost:3003/public/products/product-1/image/abc.webp',
  order: 1,
};

describe('ProductGrid', () => {
  it('renders one ProductCard per item', () => {
    render(
      <MemoryRouter>
        <ProductGrid items={[ITEM]} locale="es-AR" emptyMessage="No hay productos." />
      </MemoryRouter>,
    );

    expect(screen.getByText(ITEM.name)).toBeInTheDocument();
  });

  it('renders the empty state when items is empty', () => {
    render(
      <MemoryRouter>
        <ProductGrid items={[]} locale="es-AR" emptyMessage="No hay productos que coincidan." />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('product-grid-empty')).toHaveTextContent(
      'No hay productos que coincidan.',
    );
  });
});
