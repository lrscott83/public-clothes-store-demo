import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderCard } from '../order-card';
import type { Order } from '../../../domain/types';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    items: [],
    client: { id: 'client-1', name: 'Ana Pérez' },
    payment: { method: 'USD' },
    warehouseId: 'wh-1',
    gestorId: 'gestor-1',
    state: 'creado',
    totalUSD: 150,
    createdAt: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('OrderCard', () => {
  it('shows id, client name, and totalUSD', () => {
    render(<OrderCard order={buildOrder()} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.getByText('order-1')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('$150')).toBeInTheDocument();
  });

  it('shows the frozen totalMN when present', () => {
    render(
      <OrderCard order={buildOrder({ state: 'verificado', totalMN: 8000 })} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />,
    );

    expect(screen.getByText(/8000/)).toBeInTheDocument();
  });

  it('does not show a totalMN line when it is absent', () => {
    render(<OrderCard order={buildOrder({ totalMN: undefined })} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.queryByText(/mn/i)).not.toBeInTheDocument();
  });

  it('renders "Revisar" only on a "creado" card, and clicking it calls onRevisar with the order id', () => {
    const onRevisar = vi.fn();
    render(<OrderCard order={buildOrder({ state: 'creado' })} onRevisar={onRevisar} onMarkPaid={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^revisar$/i }));

    expect(onRevisar).toHaveBeenCalledWith('order-1');
    expect(screen.queryByRole('button', { name: /marcar comisión pagada/i })).not.toBeInTheDocument();
  });

  it('renders "Marcar comisión pagada" only on an "entregado" card, and clicking it calls onMarkPaid with the order id', () => {
    const onMarkPaid = vi.fn();
    render(<OrderCard order={buildOrder({ state: 'entregado' })} onRevisar={vi.fn()} onMarkPaid={onMarkPaid} />);

    fireEvent.click(screen.getByRole('button', { name: /marcar comisión pagada/i }));

    expect(onMarkPaid).toHaveBeenCalledWith('order-1');
    expect(screen.queryByRole('button', { name: /^revisar$/i })).not.toBeInTheDocument();
  });

  it('renders no action button for other states', () => {
    render(<OrderCard order={buildOrder({ state: 'transportando' })} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^revisar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar comisión pagada/i })).not.toBeInTheDocument();
  });

  it('renders with no crash and no action buttons when onRevisar/onMarkPaid are omitted', () => {
    render(<OrderCard order={buildOrder({ state: 'creado' })} />);

    expect(screen.getByText('order-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^revisar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar comisión pagada/i })).not.toBeInTheDocument();
  });

  it('renders "Asignar transportista" only on a "verificado" card, and clicking it calls onAsignarTransportista with the order id', () => {
    const onAsignarTransportista = vi.fn();
    render(
      <OrderCard order={buildOrder({ state: 'verificado' })} onAsignarTransportista={onAsignarTransportista} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /asignar transportista/i }));

    expect(onAsignarTransportista).toHaveBeenCalledWith('order-1');
  });

  it('does not render "Asignar transportista" when the callback is omitted, even on a "verificado" card', () => {
    render(<OrderCard order={buildOrder({ state: 'verificado' })} />);

    expect(screen.queryByRole('button', { name: /asignar transportista/i })).not.toBeInTheDocument();
  });

  it('renders "Marcar entregado" only on a "transportando" card, and clicking it calls onMarcarEntregado with the order id', () => {
    const onMarcarEntregado = vi.fn();
    render(<OrderCard order={buildOrder({ state: 'transportando' })} onMarcarEntregado={onMarcarEntregado} />);

    fireEvent.click(screen.getByRole('button', { name: /marcar entregado/i }));

    expect(onMarcarEntregado).toHaveBeenCalledWith('order-1');
  });

  it('does not render "Marcar entregado" when the callback is omitted, even on a "transportando" card (no-button-on-transportando regression)', () => {
    render(<OrderCard order={buildOrder({ state: 'transportando' })} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /marcar entregado/i })).not.toBeInTheDocument();
  });
});
