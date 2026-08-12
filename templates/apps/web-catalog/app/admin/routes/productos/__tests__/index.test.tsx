import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { ProductosAdminPage } from '../index';
import type { AdminCategoryDto, AdminProductDto } from '../../../lib/admin-api.types';

const CATEGORY: AdminCategoryDto = {
  id: 'cat-1',
  name: 'Remeras',
  slug: 'remeras',
  image: null,
  icon: null,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PRODUCT: AdminProductDto = {
  id: 'product-1',
  name: 'Remera Oversize',
  description: 'Remera de algodón 100%.',
  sku: null,
  barcode: null,
  price: { amount: '100.00', currency: 'USD' },
  percentDiscountPrice: '0.00',
  discountPrice: '0.00',
  cost: { amount: '50.00', currency: 'USD' },
  finalPrice: { amount: '100.00', currency: 'USD' },
  isOffer: false,
  categoryId: 'cat-1',
  image: 'products/remera.jpg',
  isNew: false,
  order: 1,
  active: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage(products: AdminProductDto[]) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <ProductosAdminPage products={products} categories={[CATEGORY]} /> },
  ]);
  return render(<Stub />);
}

describe('ProductosAdminPage', () => {
  it('renders the empty state when there are no products', () => {
    renderPage([]);
    expect(screen.getByText('No hay productos todavía.')).toBeInTheDocument();
  });

  it('renders a row per product with its resolved category name and active/inactive status', () => {
    renderPage([PRODUCT]);

    expect(screen.getByText('Remera Oversize')).toBeInTheDocument();
    expect(screen.getByText('Remeras')).toBeInTheDocument();
    expect(screen.getByTestId('product-status-product-1')).toHaveTextContent('Inactivo');
  });
});
