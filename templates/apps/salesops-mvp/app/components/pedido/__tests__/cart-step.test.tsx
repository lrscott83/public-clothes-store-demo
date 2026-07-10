import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartStep } from '../cart-step';
import type { SeededProduct } from '../../../domain/types';

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
  it('disables "Siguiente" when the cart is empty', () => {
    render(<CartStep catalog={[buildProduct()]} cart={[]} onChange={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('enables "Siguiente" and calls onNext when the cart has lines', () => {
    const onNext = vi.fn();
    render(
      <CartStep
        catalog={[buildProduct()]}
        cart={[{ productId: 'p-1', quantity: 1 }]}
        onChange={vi.fn()}
        onNext={onNext}
      />,
    );
    const next = screen.getByRole('button', { name: /siguiente/i });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('adding a product calls onChange with a new cart line', () => {
    const onChange = vi.fn();
    render(<CartStep catalog={[buildProduct()]} cart={[]} onChange={onChange} onNext={vi.fn()} />);
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
        onNext={vi.fn()}
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
        onNext={vi.fn()}
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
        onNext={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /disminuir cantidad de cafetera/i }));
    expect(onChange).toHaveBeenCalledWith([{ productId: 'p-1', quantity: 1 }]);

    rerender(
      <CartStep
        catalog={[buildProduct()]}
        cart={[{ productId: 'p-1', quantity: 1 }]}
        onChange={onChange}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /disminuir cantidad de cafetera/i })).toBeDisabled();
  });
});
