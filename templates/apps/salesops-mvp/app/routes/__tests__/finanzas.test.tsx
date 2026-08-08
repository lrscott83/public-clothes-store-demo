import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Finanzas from '../finanzas';
import { loadSeedState, saveSeedState, verifyOrder } from '../../store/seed-store';

describe('Finanzas container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders exactly one <h1>Finanzas</h1> and all 3 layers when qualifying orders exist', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Finanzas />);

    expect(screen.getByRole('heading', { level: 1, name: 'Finanzas' })).toBeInTheDocument();

    // Layer 1 — 4 KPI tiles (some labels are reused as table headers further
    // down the page, e.g. "Comisión pendiente" in the gestor table, so
    // assert presence rather than uniqueness here).
    expect(screen.getByText('Ingresos facturados')).toBeInTheDocument();
    expect(screen.getByText('Ingresos liquidados')).toBeInTheDocument();
    expect(screen.getAllByText('Comisión pendiente').length).toBeGreaterThan(0);
    expect(screen.getByText('Margen neto')).toBeInTheDocument();

    // Layer 2 — 4 visuals
    expect(screen.getByText(/ventas por día/i)).toBeInTheDocument();
    expect(screen.getByText('Comisión pagada vs pendiente')).toBeInTheDocument();
    expect(screen.getByText('Ingresos por estado')).toBeInTheDocument();
    expect(screen.getByText('Mix por moneda')).toBeInTheDocument();

    // Layer 3 — actionable blocks
    expect(screen.getByText('Comisión y ROI por gestor')).toBeInTheDocument();
    expect(screen.getByText('Ventas por almacén')).toBeInTheDocument();
    expect(screen.getByText('Flujo por estado')).toBeInTheDocument();
    expect(screen.getByText('Top productos por margen')).toBeInTheDocument();
    expect(screen.getByText('Pedidos de menor margen')).toBeInTheDocument();
    expect(screen.getByText('Ticket promedio')).toBeInTheDocument();
  });

  it('renders a single unambiguous heading matching /finanzas/i, with the descriptor as a <p>, not a heading', () => {
    loadSeedState();
    render(<Finanzas />);

    const headings = screen.getAllByRole('heading');
    const matching = headings.filter((h) => /finanzas/i.test(h.textContent ?? ''));
    expect(matching).toHaveLength(1);
    expect(matching[0].tagName).toBe('H1');

    for (const heading of headings) {
      expect(heading.textContent?.toLowerCase()).not.toContain('comisiones y flujo de caja');
    }
    expect(screen.getByText('Comisiones y flujo de caja').tagName).toBe('P');
    expect(
      screen.queryByRole('heading', { name: /comisiones y flujo de caja/i }),
    ).not.toBeInTheDocument();
  });

  it('renders no <form> and no mutation-affordance copy', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    const { container } = render(<Finanzas />);

    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByText(/marcar comisi[oó]n pagada/i)).not.toBeInTheDocument();
  });

  it('with zero qualifying orders (only creado), shows the empty-state message instead of Layer 1/2 and the gestor/warehouse blocks; Flujo por estado still renders', () => {
    const state = loadSeedState();
    state.orders = state.orders.map((order) => ({ ...order, state: 'creado' as const }));
    saveSeedState(state);

    render(<Finanzas />);

    expect(screen.getByRole('heading', { level: 1, name: 'Finanzas' })).toBeInTheDocument();
    expect(screen.queryByText('Ingresos facturados')).not.toBeInTheDocument();
    expect(screen.queryByText('Comisión y ROI por gestor')).not.toBeInTheDocument();
    expect(screen.queryByText('Ventas por almacén')).not.toBeInTheDocument();
    expect(screen.queryByText('Top productos por margen')).not.toBeInTheDocument();
    expect(screen.queryByText('Pedidos de menor margen')).not.toBeInTheDocument();
    expect(screen.getByText(/no hay pedidos/i)).toBeInTheDocument();
    // Flujo por estado (state-breakdown-table) still renders — it counts every state including creado.
    expect(screen.getByText('Flujo por estado')).toBeInTheDocument();
  });
});
