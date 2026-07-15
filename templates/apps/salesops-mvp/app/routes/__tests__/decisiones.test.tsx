import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Decisiones from '../decisiones';
import { loadSeedState, saveSeedState, verifyOrder } from '../../store/seed-store';

describe('Decisiones container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders exactly one <h1>Decisiones</h1> and all 3 layers when qualifying orders exist', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    render(<Decisiones />);

    expect(screen.getByRole('heading', { level: 1, name: 'Decisiones' })).toBeInTheDocument();

    // Layer 1 — 5 KPI tiles (some labels are reused as table headers further
    // down the page, e.g. "Ventas"/"Pedidos" in the gestor ranking table, so
    // assert presence rather than uniqueness here).
    expect(screen.getAllByText('Ventas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Margen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pedidos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Comisión pendiente').length).toBeGreaterThan(0);

    // Layer 2 — 4 visuals
    expect(screen.getByText('Tendencia de ventas (20 días)')).toBeInTheDocument();
    expect(screen.getByText('Pedidos por etapa')).toBeInTheDocument();
    expect(screen.getByText('Ventas por almacén')).toBeInTheDocument();
    expect(screen.getByText('Mix por moneda')).toBeInTheDocument();

    // Layer 3 — actionable blocks
    expect(screen.getByText('Ranking de gestores')).toBeInTheDocument();
    expect(screen.queryByText('Top productos por margen')).not.toBeInTheDocument();
    expect(screen.queryByText('Pedidos de menor margen')).not.toBeInTheDocument();
  });

  it('renders a single unambiguous heading matching /decisiones/i; no subheading repeats it', () => {
    loadSeedState();
    render(<Decisiones />);

    const headings = screen.getAllByRole('heading');
    const matching = headings.filter((h) => /decisiones/i.test(h.textContent ?? ''));
    expect(matching).toHaveLength(1);
    expect(matching[0].tagName).toBe('H1');
  });

  it('shows an empty-state message (h1 still renders) when only creado orders exist; stage distribution is exempt', () => {
    const state = loadSeedState();
    state.orders = state.orders.map((order) => ({ ...order, state: 'creado' as const }));
    saveSeedState(state);

    render(<Decisiones />);

    expect(screen.getByRole('heading', { level: 1, name: 'Decisiones' })).toBeInTheDocument();
    expect(screen.queryByText('Ventas')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranking de gestores')).not.toBeInTheDocument();
    expect(screen.getByText(/no hay pedidos/i)).toBeInTheDocument();
    // Stage distribution is exempt from the empty-state and MAY still render.
    expect(screen.getByText('Pedidos por etapa')).toBeInTheDocument();
  });

  it('renders no <form> and no store-mutating button; the cantidad/valor toggle does not mutate SeedState', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    const { container } = render(<Decisiones />);

    expect(container.querySelector('form')).toBeNull();
    const toggleButtons = screen.getAllByRole('button', { name: /cantidad|valor/i });
    expect(toggleButtons.length).toBeGreaterThan(0);
  });

  it('renders no sales-target/meta/objective-compliance element', () => {
    const state = loadSeedState();
    const creadoOrder = state.orders.find((o) => o.state === 'creado');
    if (creadoOrder) verifyOrder(creadoOrder.id);

    const { container } = render(<Decisiones />);
    const text = container.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('meta de ventas');
    expect(text).not.toContain('objetivo');
    expect(text).not.toContain('% cumplimiento');
  });
});
