import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '../kanban-board';
import type { Order, OrderState } from '../../../domain/types';

function buildOrder(id: string, state: OrderState): Order {
  return {
    id,
    items: [],
    client: { id: `client-${id}`, name: `Cliente ${id}` },
    payment: { method: 'efectivo' },
    warehouseId: 'wh-1',
    gestorId: 'gestor-1',
    state,
    totalUSD: 100,
    createdAt: '2026-07-09T12:00:00.000Z',
  };
}

describe('KanbanBoard', () => {
  it('renders exactly 5 columns, one per OrderState, in funnel order', () => {
    render(<KanbanBoard orders={[]} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(5);
    expect(headings.map((h) => h.textContent)).toEqual([
      expect.stringMatching(/^creado/i),
      expect.stringMatching(/^verificado/i),
      expect.stringMatching(/^transportando/i),
      expect.stringMatching(/^entregado/i),
      expect.stringMatching(/comisión pagada/i),
    ]);
  });

  it('buckets orders by state into the matching column', () => {
    const orders = [buildOrder('order-1', 'creado'), buildOrder('order-2', 'verificado'), buildOrder('order-3', 'entregado')];
    const { container } = render(<KanbanBoard orders={orders} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />);

    const creadoSection = container.querySelector('[data-state="creado"]')!;
    const verificadoSection = container.querySelector('[data-state="verificado"]')!;
    const entregadoSection = container.querySelector('[data-state="entregado"]')!;

    expect(creadoSection.textContent).toContain('order-1');
    expect(verificadoSection.textContent).toContain('order-2');
    expect(entregadoSection.textContent).toContain('order-3');
    expect(creadoSection.textContent).not.toContain('order-2');
  });

  it('renders a static structure with no drag & drop wiring', () => {
    const { container } = render(
      <KanbanBoard orders={[buildOrder('order-1', 'creado')]} onRevisar={vi.fn()} onMarkPaid={vi.fn()} />,
    );

    expect(container.querySelector('[draggable]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/ondrag/i);
  });

  it('renders only the columns listed in visibleStates, in that order', () => {
    render(
      <KanbanBoard
        orders={[buildOrder('order-1', 'verificado'), buildOrder('order-2', 'transportando')]}
        visibleStates={['verificado', 'transportando', 'entregado']}
      />,
    );

    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(3);
    expect(headings.map((h) => h.textContent)).toEqual([
      expect.stringMatching(/^verificado/i),
      expect.stringMatching(/^transportando/i),
      expect.stringMatching(/^entregado/i),
    ]);
  });

  it('passes onAsignarTransportista/onMarcarEntregado through to the columns/cards', () => {
    const onAsignarTransportista = vi.fn();
    const onMarcarEntregado = vi.fn();
    render(
      <KanbanBoard
        orders={[buildOrder('order-1', 'verificado')]}
        visibleStates={['verificado']}
        onAsignarTransportista={onAsignarTransportista}
        onMarcarEntregado={onMarcarEntregado}
      />,
    );

    expect(screen.getByRole('button', { name: /asignar transportista/i })).toBeInTheDocument();
  });
});
