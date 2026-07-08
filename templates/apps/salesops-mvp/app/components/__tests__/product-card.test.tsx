import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StoreProduct } from '@store-mgmt/storefront/catalog';
import { ProductCard } from '../product-card';

function buildProduct(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'p1',
    name: 'Fixture Product',
    description: 'A fixture product for tests.',
    price: 19.99,
    categoryId: 'fixture-category',
    image: '/catalog/appliances/products/fixture/p1.jpg',
    ...overrides,
  };
}

describe('ProductCard', () => {
  it('renders the product name', () => {
    const product = buildProduct({ name: 'Cafetera de fogón 6 tazas' });

    render(<ProductCard product={product} locale="en-US" currency="USD" />);

    expect(screen.getByText('Cafetera de fogón 6 tazas')).toBeInTheDocument();
  });

  it('formats the price via formatMoney (Intl.NumberFormat), not string concatenation', () => {
    const product = buildProduct({ price: 1234.5 });

    render(<ProductCard product={product} locale="en-US" currency="USD" />);

    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
  });
});
