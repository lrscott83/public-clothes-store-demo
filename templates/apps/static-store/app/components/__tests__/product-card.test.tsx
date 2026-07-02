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
    image: '/verticals/fixture/products/p1.jpg',
    ...overrides,
  };
}

describe('ProductCard', () => {
  it('formats the price via Intl.NumberFormat, not "$" + toFixed concatenation', () => {
    const product = buildProduct({ price: 1234.5 });

    render(<ProductCard product={product} locale="en-US" currency="USD" />);

    // en-US/USD Intl.NumberFormat output — distinguishable from naive "$1234.50".
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
  });

  it('formats the price per locale/currency (es-NI/NIO)', () => {
    const product = buildProduct({ price: 500 });

    render(<ProductCard product={product} locale="es-NI" currency="NIO" />);

    expect(
      screen.getByText(new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(500)),
    ).toBeInTheDocument();
  });

  it('renders a "new" badge styled via a theme token when isNew is true', () => {
    const product = buildProduct({ isNew: true });

    render(<ProductCard product={product} locale="en-US" currency="USD" />);

    const badge = screen.getByTestId('product-badge-new');
    expect(badge).toHaveClass('bg-success');
    expect(badge).not.toHaveClass('bg-green-500');
  });

  it('renders a discount badge styled via a theme token when discount is set', () => {
    const product = buildProduct({ discount: 20 });

    render(<ProductCard product={product} locale="en-US" currency="USD" />);

    const badge = screen.getByTestId('product-badge-discount');
    expect(badge).toHaveTextContent('-20%');
    expect(badge).toHaveClass('bg-danger');
    expect(badge).not.toHaveClass('bg-red-500');
  });

  it('renders neither badge when isNew/discount are absent', () => {
    const product = buildProduct();

    render(<ProductCard product={product} locale="en-US" currency="USD" />);

    expect(screen.queryByTestId('product-badge-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-badge-discount')).not.toBeInTheDocument();
  });
});
