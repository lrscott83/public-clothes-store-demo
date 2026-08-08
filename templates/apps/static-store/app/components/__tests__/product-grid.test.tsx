import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StoreProduct } from '@store-mgmt/storefront/catalog';
import { ProductGrid } from '../product-grid';

function buildProducts(): StoreProduct[] {
  return [
    {
      id: 'p1',
      name: 'Shirt',
      description: 'A shirt.',
      price: 10,
      categoryId: 'tops',
      image: '/verticals/fixture/products/p1.jpg',
    },
    {
      id: 'p2',
      name: 'Hat',
      description: 'A hat.',
      price: 15,
      categoryId: 'accessories',
      image: '/verticals/fixture/products/p2.jpg',
    },
    {
      id: 'p3',
      name: 'Pants',
      description: 'Pants.',
      price: 25,
      categoryId: 'tops',
      image: '/verticals/fixture/products/p3.jpg',
    },
  ];
}

describe('ProductGrid', () => {
  it('renders a card for every product given (e.g. all products across categories)', () => {
    const products = buildProducts();

    render(<ProductGrid products={products} locale="en-US" currency="USD" />);

    expect(screen.getByText('Shirt')).toBeInTheDocument();
    expect(screen.getByText('Hat')).toBeInTheDocument();
    expect(screen.getByText('Pants')).toBeInTheDocument();
  });

  it('renders only the products it is given (e.g. a category-filtered subset)', () => {
    const products = buildProducts().filter((product) => product.categoryId === 'tops');

    render(<ProductGrid products={products} locale="en-US" currency="USD" />);

    expect(screen.getByText('Shirt')).toBeInTheDocument();
    expect(screen.getByText('Pants')).toBeInTheDocument();
    expect(screen.queryByText('Hat')).not.toBeInTheDocument();
  });

  it('renders a graceful empty state when given zero products', () => {
    render(<ProductGrid products={[]} locale="en-US" currency="USD" />);

    expect(screen.getByTestId('product-grid-empty')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
