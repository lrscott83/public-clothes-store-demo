import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import OperadorGestores from '../operador-gestores';
import { createOrder, loadSeedState, saveSeedState } from '../../store/seed-store';
import type { CreateOrderInput } from '../../store/seed-store';
import type { Order, OrderItem } from '../../domain/types';

const items: OrderItem[] = [{ productId: 'p-1', quantity: 1, priceUSD: 50, commissionMN: 10 }];

const baseInput: CreateOrderInput = {
  items,
  client: { id: 'client-user-1', name: 'Ana Pérez', phone: '555-1234' },
  payment: { method: 'efectivo' },
  warehouseId: 'wh-1',
  gestorId: 'gestor-1',
};

/** Pushes a fully-formed Order directly into the persisted SeedState — used
 * only to set up fixtures for states the container's own flow can't reach
 * yet (e.g. `entregado`, which is out of scope for this change). */
function pushOrder(order: Order) {
  const state = loadSeedState();
  state.orders.push(order);
  saveSeedState(state);
}

function buildEntregadoOrder(id: string): Order {
  return {
    id,
    items,
    client: { id: 'client-2', name: 'Luis Gómez' },
    payment: { method: 'efectivo' },
    warehouseId: 'wh-1',
    gestorId: 'gestor-1',
    state: 'entregado',
    totalUSD: 50,
    exchangeRateSnapshot: { usdToMn: 680 },
    totalMN: 34000,
    commissionMN: 10,
    createdAt: '2026-07-01T12:00:00.000Z',
    verifiedAt: '2026-07-02T12:00:00.000Z',
    transportingAt: '2026-07-03T12:00:00.000Z',
    deliveredAt: '2026-07-04T12:00:00.000Z',
  };
}

describe('OperadorGestores container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the heading and a 5-column board with seeded orders', () => {
    loadSeedState();
    render(<OperadorGestores />);

    expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();
    expect(screen.getAllByRole('heading').length).toBeGreaterThanOrEqual(5);
  });

  it('Revisar swaps to the review view; Aceptar verifies the order and returns it to the board in the verificado column', () => {
    loadSeedState();
    const created = createOrder(baseInput, new Date());
    const { container } = render(<OperadorGestores />);

    const card = screen.getByText(created.id).closest('li')!;
    fireEvent.click(card.querySelector('button')!);

    // Swapped to review: heading persists, review content for this order shows.
    expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`revisar pedido ${created.id}`, 'i'))).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }));

    // Back on the board; heading still persists.
    expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();
    expect(screen.queryByText(/revisar pedido/i)).not.toBeInTheDocument();

    const verificadoSection = container.querySelector('[data-state="verificado"]')!;
    expect(verificadoSection.textContent).toContain(created.id);

    const persisted = loadSeedState().orders.find((order) => order.id === created.id);
    expect(persisted?.state).toBe('verificado');
    expect(persisted?.totalMN).toBe(Math.round(created.totalUSD * 680));
  });

  it('Marcar comisión pagada on an entregado order swaps it to the comision_pagada column', () => {
    loadSeedState();
    const entregado = buildEntregadoOrder('order-entregado-1');
    pushOrder(entregado);
    const { container } = render(<OperadorGestores />);

    const card = screen.getByText(entregado.id).closest('li')!;
    fireEvent.click(card.querySelector('button')!);

    const paidSection = container.querySelector('[data-state="comision_pagada"]')!;
    expect(paidSection.textContent).toContain(entregado.id);

    const entregadoSection = container.querySelector('[data-state="entregado"]')!;
    expect(entregadoSection.textContent).not.toContain(entregado.id);

    const persisted = loadSeedState().orders.find((order) => order.id === entregado.id);
    expect(persisted?.state).toBe('comision_pagada');
    expect(persisted?.commissionPaidAt).toBeDefined();
    // Frozen fields untouched.
    expect(persisted?.totalMN).toBe(34000);
    expect(persisted?.commissionMN).toBe(10);
  });

  it('the "Operador de gestores" heading persists across board and review views', () => {
    loadSeedState();
    const created = createOrder(baseInput, new Date());
    render(<OperadorGestores />);

    expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();

    const card = screen.getByText(created.id).closest('li')!;
    fireEvent.click(card.querySelector('button')!);

    expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();
  });
});
