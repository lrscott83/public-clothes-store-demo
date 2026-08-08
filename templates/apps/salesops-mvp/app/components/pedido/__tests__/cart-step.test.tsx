import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartStep } from '../cart-step';
import type { SeededProduct } from '../../../domain/types';
import { catalogProvider } from '../../../data/catalog';

function buildProduct(overrides: Partial<SeededProduct> = {}): SeededProduct {
  return {
    id: 'p-1',
    name: 'Cafetera',
    description: 'Cafetera de fogón',
    price: 100,
    categoryId: 'cat-1',
    image: '/img.jpg',
    commissionMN: 50,
    costUSD: 60,
    ...overrides,
  };
}

describe('CartStep', () => {
  it('adding a product calls onChange with a new cart line', () => {
    const onChange = vi.fn();
    render(<CartStep catalog={[buildProduct()]} cart={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /agregar cafetera al carrito/i }));
    expect(onChange).toHaveBeenCalledWith([{ productId: 'p-1', quantity: 1 }]);
  });

  it('removing a line calls onChange without that line', () => {
    const onChange = vi.fn();
    render(
      <CartStep
        catalog={[buildProduct()]}
        cart={[{ productId: 'p-1', quantity: 2 }]}
        onChange={onChange}
       
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /quitar cafetera del carrito/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('incrementing quantity calls onChange with quantity + 1', () => {
    const onChange = vi.fn();
    render(
      <CartStep
        catalog={[buildProduct()]}
        cart={[{ productId: 'p-1', quantity: 1 }]}
        onChange={onChange}
       
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad de cafetera/i }));
    expect(onChange).toHaveBeenCalledWith([{ productId: 'p-1', quantity: 2 }]);
  });

  it('decrementing quantity calls onChange with quantity - 1, and is disabled at quantity 1', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CartStep
        catalog={[buildProduct()]}
        cart={[{ productId: 'p-1', quantity: 2 }]}
        onChange={onChange}
       
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /disminuir cantidad de cafetera/i }));
    expect(onChange).toHaveBeenCalledWith([{ productId: 'p-1', quantity: 1 }]);

    rerender(
      <CartStep
        catalog={[buildProduct()]}
        cart={[{ productId: 'p-1', quantity: 1 }]}
        onChange={onChange}
       
      />,
    );
    expect(screen.getByRole('button', { name: /disminuir cantidad de cafetera/i })).toBeDisabled();
  });

  // ── Filter & Search tests ──────────────────────────────────────────────

  function buildProduct2(id: string, name: string, categoryId: string, overrides: Partial<SeededProduct> = {}): SeededProduct {
    return buildProduct({ id, name, categoryId, ...overrides });
  }

  it('shows all products when no filter is selected', () => {
    render(
      <CartStep
        catalog={[buildProduct2('p-1', 'A', 'cat-1'), buildProduct2('p-2', 'B', 'cat-2')]}
        cart={[]}
        onChange={vi.fn()}
       
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('filters products by category', () => {
    const cats = catalogProvider.getCategories();
    const catA = cats[0].id;
    const catB = cats[1].id;
    render(
      <CartStep
        catalog={[buildProduct2('p-1', 'A', catA), buildProduct2('p-2', 'B', catB)]}
        cart={[]}
        onChange={vi.fn()}
       
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: catA } });
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('searches products by name (case-insensitive)', () => {
    render(
      <CartStep
        catalog={[
          buildProduct2('p-1', 'Cafetera', 'cat-1'),
          buildProduct2('p-2', 'Licuadora', 'cat-2'),
        ]}
        cart={[]}
        onChange={vi.fn()}
       
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/buscar producto/i), { target: { value: 'cafe' } });
    expect(screen.getByText('Cafetera')).toBeInTheDocument();
    expect(screen.queryByText('Licuadora')).not.toBeInTheDocument();
  });

  it('combines category filter and text search', () => {
    const cats = catalogProvider.getCategories();
    const catA = cats[0].id;
    const catB = cats[1].id;
    const p1 = buildProduct2('p-1', 'Cafetera A', catA);
    const p2 = buildProduct2('p-2', 'Cafetera B', catB);
    const p3 = buildProduct2('p-3', 'Licuadora', catA);
    render(<CartStep catalog={[p1, p2, p3]} cart={[]} onChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: catA } });
    fireEvent.change(screen.getByPlaceholderText(/buscar producto/i), { target: { value: 'cafe' } });
    expect(screen.getByText('Cafetera A')).toBeInTheDocument();
    expect(screen.queryByText('Cafetera B')).not.toBeInTheDocument();
    expect(screen.queryByText('Licuadora')).not.toBeInTheDocument();
  });

  it('shows empty state message when no products match filters', () => {
    render(<CartStep catalog={[buildProduct()]} cart={[]} onChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/buscar producto/i), { target: { value: 'NONEXISTENT' } });
    expect(screen.getByText(/no se encontraron productos/i)).toBeInTheDocument();
  });

  it('does not search by description text', () => {
    render(
      <CartStep
        catalog={[buildProduct2('p-1', 'Cafetera', 'cat-1', { description: 'hidden desc' })]}
        cart={[]}
        onChange={vi.fn()}
       
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/buscar producto/i), { target: { value: 'hidden' } });
    expect(screen.getByText(/no se encontraron productos/i)).toBeInTheDocument();
  });

  it('renders category filter options', () => {
    render(<CartStep catalog={[buildProduct()]} cart={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Todas las categorías')).toBeInTheDocument();
  });
});
