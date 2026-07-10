import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('formats the price via formatMoney', () => {
    const product = buildProduct({ price: 1234.5 });
    render(<ProductCard product={product} locale="en-US" currency="USD" />);
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
  });

  it('shows a New badge when product.isNew is true', () => {
    const product = buildProduct({ isNew: true });
    render(<ProductCard product={product} locale="en-US" currency="USD" />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows a discount badge when product.discount is set', () => {
    const product = buildProduct({ discount: 15 });
    render(<ProductCard product={product} locale="en-US" currency="USD" />);
    expect(screen.getByText('-15%')).toBeInTheDocument();
  });

  it('shows both badges when isNew and discount are set', () => {
    const product = buildProduct({ isNew: true, discount: 10 });
    render(<ProductCard product={product} locale="en-US" currency="USD" />);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('-10%')).toBeInTheDocument();
  });

  it('shows no badges when isNew and discount are absent', () => {
    render(<ProductCard product={buildProduct()} locale="en-US" currency="USD" />);
    expect(screen.queryByText('New')).not.toBeInTheDocument();
    expect(screen.queryByText(/-%\d*/)).not.toBeInTheDocument();
  });

  it('shows original price strikethrough when product.originalPrice is set', () => {
    const product = buildProduct({ price: 40, originalPrice: 50 });
    render(<ProductCard product={product} locale="en-US" currency="USD" />);
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00').classList.contains('line-through')).toBe(true);
  });

  it('shows add-to-cart icon button when cart prop quantity is 0', () => {
    const onAdd = vi.fn();
    render(
      <ProductCard
        product={buildProduct({ name: 'Test Item' })}
        locale="en-US"
        currency="USD"
        cart={{ quantity: 0, onAddToCart: onAdd, onIncrement: vi.fn(), onDecrement: vi.fn(), onRemove: vi.fn() }}
      />,
    );
    const btn = screen.getByRole('button', { name: /agregar test item al carrito/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows quantity stepper when cart prop quantity > 0', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const onRemove = vi.fn();
    render(
      <ProductCard
        product={buildProduct({ name: 'Test Item' })}
        locale="en-US"
        currency="USD"
        cart={{ quantity: 3, onAddToCart: vi.fn(), onIncrement, onDecrement, onRemove }}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad de test item/i }));
    expect(onIncrement).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /disminuir cantidad de test item/i }));
    expect(onDecrement).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /quitar test item del carrito/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('disables decrement button when quantity is 1', () => {
    render(
      <ProductCard
        product={buildProduct({ name: 'Test Item' })}
        locale="en-US"
        currency="USD"
        cart={{ quantity: 1, onAddToCart: vi.fn(), onIncrement: vi.fn(), onDecrement: vi.fn(), onRemove: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: /disminuir cantidad de test item/i })).toBeDisabled();
  });

  it('renders no cart UI when cart prop is not provided', () => {
    render(<ProductCard product={buildProduct()} locale="en-US" currency="USD" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
