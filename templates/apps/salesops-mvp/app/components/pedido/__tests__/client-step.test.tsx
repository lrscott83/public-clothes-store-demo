import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClientStep, type ClientStepDraft } from '../client-step';

function buildDraft(overrides: Partial<ClientStepDraft> = {}): ClientStepDraft {
  return {
    name: '',
    phone: '',
    address: '',
    deliveryMode: 'domicilio',
    method: 'efectivo',
    needsChange: false,
    observations: '',
    ...overrides,
  };
}

const emptyCart = { cartItems: [], cartTotalUSD: 0 };

describe('ClientStep', () => {
  it('shows the address field when deliveryMode is domicilio', () => {
    render(<ClientStep draft={buildDraft()} onChange={vi.fn()} {...emptyCart} />);

    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
  });

  it('hides the address field when deliveryMode is recogida', () => {
    render(
      <ClientStep
        draft={buildDraft({ deliveryMode: 'recogida' })}
        onChange={vi.fn()}
        {...emptyCart}
      />,
    );

    expect(screen.queryByLabelText(/dirección/i)).not.toBeInTheDocument();
  });

  it('typing in the name field calls onChange with the updated draft', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<ClientStep draft={draft} onChange={onChange} {...emptyCart} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });

    expect(onChange).toHaveBeenCalledWith({ ...draft, name: 'Ana' });
  });

  it('selecting "Recogida" calls onChange with deliveryMode "recogida"', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<ClientStep draft={draft} onChange={onChange} {...emptyCart} />);

    fireEvent.click(screen.getByRole('radio', { name: /recogida/i }));

    expect(onChange).toHaveBeenCalledWith({ ...draft, deliveryMode: 'recogida' });
  });

  it('renders the readonly cart summary heading', () => {
    render(<ClientStep draft={buildDraft()} onChange={vi.fn()} {...emptyCart} />);

    expect(screen.getByText('Resumen del pedido')).toBeInTheDocument();
  });

  it('shows cart items details right column', () => {
    render(
      <ClientStep
        draft={buildDraft()}
        onChange={vi.fn()}
        cartItems={[
          { productId: 'p-1', name: 'Cafetera', image: '/img.jpg', price: 100, quantity: 2 },
        ]}
        cartTotalUSD={200}
      />,
    );

    expect(screen.getByText('Cafetera')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00')).toHaveLength(2);
  });
});
