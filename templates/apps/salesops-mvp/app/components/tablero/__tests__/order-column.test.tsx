import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderColumn } from '../order-column';
import type { Order } from '../../../domain/types';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    items: [],
    client: { id: 'client-1', name: 'Ana Pérez' },
    payment: { method: 'efectivo' },
    warehouseId: 'wh-1',
    gestorId: 'gestor-1',
    state: 'creado',
    totalUSD: 150,
    createdAt: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('OrderColumn', () => {
  it('renders the header with title and order count', () => {
    const orders = [buildOrder({ id: 'order-1' }), buildOrder({ id: 'order-2' })];
    render(<OrderColumn title="Creado" state="creado" orders={orders} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /creado/i })).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('renders one OrderCard per order', () => {
    const orders = [buildOrder({ id: 'order-1' }), buildOrder({ id: 'order-2' })];
    render(<OrderColumn title="Creado" state="creado" orders={orders} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.getByText('order-1')).toBeInTheDocument();
    expect(screen.getByText('order-2')).toBeInTheDocument();
  });

  it('renders zero cards and a (0) count for an empty column', () => {
    render(<OrderColumn title="Creado" state="creado" orders={[]} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    expect(screen.getByText('(0)')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('passes onRevisar through to the card and it fires with the order id', () => {
    const onRevisar = vi.fn();
    const orders = [buildOrder({ id: 'order-1', state: 'creado' })];
    render(
      <OrderColumn title="Creado" state="creado" orders={orders} onRevisar={onRevisar} onMarkPaid={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^revisar$/i }));

    expect(onRevisar).toHaveBeenCalledWith('order-1');
  });

  it('passes onMarkPaid through to the card and it fires with the order id', () => {
    const onMarkPaid = vi.fn();
    const orders = [buildOrder({ id: 'order-1', state: 'entregado' })];
    render(
      <OrderColumn
        title="Entregado"
        state="entregado"
        orders={orders}
        onRevisar={vi.fn()}
        onMarkPaid={onMarkPaid}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /marcar comisión pagada/i }));

    expect(onMarkPaid).toHaveBeenCalledWith('order-1');
  });

  it('renders with no crash when onRevisar/onMarkPaid are omitted', () => {
    const orders = [buildOrder({ id: 'order-1', state: 'creado' })];
    render(<OrderColumn title="Creado" state="creado" orders={orders} />);

    expect(screen.getByText('order-1')).toBeInTheDocument();
  });

  it('passes onAsignarTransportista through to the card and it fires with the order id', () => {
    const onAsignarTransportista = vi.fn();
    const orders = [buildOrder({ id: 'order-1', state: 'verificado' })];
    render(
      <OrderColumn
        title="Verificado"
        state="verificado"
        orders={orders}
        onAsignarTransportista={onAsignarTransportista}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /asignar transportista/i }));

    expect(onAsignarTransportista).toHaveBeenCalledWith('order-1');
  });

  it('passes onMarcarEntregado through to the card and it fires with the order id', () => {
    const onMarcarEntregado = vi.fn();
    const orders = [buildOrder({ id: 'order-1', state: 'transportando' })];
    render(
      <OrderColumn
        title="Transportando"
        state="transportando"
        orders={orders}
        onMarcarEntregado={onMarcarEntregado}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /marcar entregado/i }));

    expect(onMarcarEntregado).toHaveBeenCalledWith('order-1');
  });
});
