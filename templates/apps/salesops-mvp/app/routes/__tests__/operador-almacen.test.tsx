import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import OperadorAlmacen from '../operador-almacen';
import { loadSeedState, saveSeedState } from '../../store/seed-store';
import type { Order } from '../../domain/types';

/** Pushes a fully-formed Order directly into the persisted SeedState — used
 * to set up fixtures in specific states/warehouses without going through the
 * full creado→verificado flow. */
function pushOrder(order: Order) {
  const state = loadSeedState();
  state.orders.push(order);
  saveSeedState(state);
}

function buildVerificadoOrder(id: string, warehouseId: string): Order {
  return {
    id,
    items: [{ productId: 'p-1', quantity: 1, priceUSD: 50, commissionMN: 10 }],
    client: { id: `client-${id}`, name: `Cliente ${id}` },
    payment: { method: 'efectivo' },
    warehouseId,
    gestorId: 'gestor-1',
    state: 'verificado',
    totalUSD: 50,
    exchangeRateSnapshot: { usdToMn: 680 },
    totalMN: 34000,
    commissionMN: 10,
    createdAt: '2026-07-01T12:00:00.000Z',
    verifiedAt: '2026-07-02T12:00:00.000Z',
  };
}

function buildTransportandoOrder(id: string, warehouseId: string): Order {
  return {
    ...buildVerificadoOrder(id, warehouseId),
    state: 'transportando',
    transportistaId: 'transportista-1',
    transportingAt: '2026-07-03T12:00:00.000Z',
  };
}

describe('OperadorAlmacen container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the heading, warehouse selector, and a 3-column board filtered to the default (first) warehouse', () => {
    loadSeedState();
    const orderWh1 = buildVerificadoOrder('order-wh1', 'wh-1');
    const orderWh2 = buildVerificadoOrder('order-wh2', 'wh-2');
    pushOrder(orderWh1);
    pushOrder(orderWh2);

    render(<OperadorAlmacen />);

    expect(screen.getByRole('heading', { name: /operador de almacén/i })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading');
    // 1 h1 + 3 column headings (verificado/transportando/entregado)
    expect(headings.length).toBeGreaterThanOrEqual(4);

    expect(screen.getByText('order-wh1')).toBeInTheDocument();
    expect(screen.queryByText('order-wh2')).not.toBeInTheDocument();
  });

  it('switching the warehouse selector re-filters the board without unmounting', () => {
    loadSeedState();
    pushOrder(buildVerificadoOrder('order-wh1', 'wh-1'));
    pushOrder(buildVerificadoOrder('order-wh2', 'wh-2'));

    render(<OperadorAlmacen />);

    expect(screen.getByText('order-wh1')).toBeInTheDocument();
    expect(screen.queryByText('order-wh2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/sucursal este/i));

    expect(screen.getByRole('heading', { name: /operador de almacén/i })).toBeInTheDocument();
    expect(screen.queryByText('order-wh1')).not.toBeInTheDocument();
    expect(screen.getByText('order-wh2')).toBeInTheDocument();
  });

  it('"Asignar transportista" opens the picker; confirming a carrier assigns it and moves the order to transportando', () => {
    loadSeedState();
    const order = buildVerificadoOrder('order-wh1', 'wh-1');
    pushOrder(order);
    const { container } = render(<OperadorAlmacen />);

    const card = screen.getByText(order.id).closest('li')!;
    fireEvent.click(card.querySelector('button')!);

    expect(screen.getByRole('heading', { name: /operador de almacén/i })).toBeInTheDocument();
    expect(screen.getByText(/asignar transportista/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/ernesto junco/i));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(screen.getByRole('heading', { name: /operador de almacén/i })).toBeInTheDocument();
    const transportandoSection = container.querySelector('[data-state="transportando"]')!;
    expect(transportandoSection.textContent).toContain(order.id);

    const persisted = loadSeedState().orders.find((o) => o.id === order.id);
    expect(persisted?.state).toBe('transportando');
    expect(persisted?.transportistaId).toBe('transportista-1');
  });

  it('"Marcar entregado" on a transportando order moves it to the entregado column', () => {
    loadSeedState();
    const order = buildTransportandoOrder('order-wh1', 'wh-1');
    pushOrder(order);
    const { container } = render(<OperadorAlmacen />);

    const card = screen.getByText(order.id).closest('li')!;
    fireEvent.click(card.querySelector('button')!);

    const entregadoSection = container.querySelector('[data-state="entregado"]')!;
    expect(entregadoSection.textContent).toContain(order.id);

    const persisted = loadSeedState().orders.find((o) => o.id === order.id);
    expect(persisted?.state).toBe('entregado');
    expect(persisted?.deliveredAt).toBeDefined();
  });

  it('the "Operador de almacén" heading persists across board and picker views', () => {
    loadSeedState();
    const order = buildVerificadoOrder('order-wh1', 'wh-1');
    pushOrder(order);
    render(<OperadorAlmacen />);

    expect(screen.getByRole('heading', { name: /operador de almacén/i })).toBeInTheDocument();

    const card = screen.getByText(order.id).closest('li')!;
    fireEvent.click(card.querySelector('button')!);

    expect(screen.getByRole('heading', { name: /operador de almacén/i })).toBeInTheDocument();
  });
});
